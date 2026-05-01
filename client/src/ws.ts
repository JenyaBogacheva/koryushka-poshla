import type { ClientMessage, ServerMessage, Slot } from '@shared/types';
import { useGameStore } from './store.js';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const WARNING_TIMEOUT_MS = 5000;

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let warningTimer: ReturnType<typeof setTimeout> | null = null;
let socket: WebSocket | null = null;
let intentionalClose = false;

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function setTimedWarning(msg: string): void {
  const store = useGameStore.getState();
  store.setWarning(msg);
  if (warningTimer !== null) clearTimeout(warningTimer);
  warningTimer = setTimeout(() => {
    useGameStore.getState().setWarning(null);
    warningTimer = null;
  }, WARNING_TIMEOUT_MS);
}

export function connect(): void {
  if (socket !== null && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  intentionalClose = false;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws`;
  const ws = new WebSocket(url);
  socket = ws;

  ws.addEventListener('open', () => {
    reconnectAttempts = 0;
    useGameStore.getState().setConnected(true);
    const { identity } = useGameStore.getState();
    if (identity !== null) sendJoin(identity.slot, identity.name, identity.password);
  });

  ws.addEventListener('message', (e) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(e.data) as ServerMessage;
    } catch {
      console.warn('non-JSON ws message:', e.data);
      return;
    }
    const store = useGameStore.getState();
    switch (msg.type) {
      case 'lobby':
        store.setLobby(msg.slots);
        return;
      case 'state': {
        store.setState(msg.state);
        const after = useGameStore.getState();
        if (after.identity !== null && after.pendingPlacements.length > 0) {
          const myRackIds = new Set(msg.state.players[after.identity.slot]!.rack.map((t) => t.id));
          const next = after.pendingPlacements.filter((p) => myRackIds.has(p.tileId));
          if (next.length !== after.pendingPlacements.length) {
            useGameStore.setState({ pendingPlacements: next });
          }
        }
        return;
      }
      case 'moveAccepted':
        store.clearPending();
        if (msg.dictionaryWarnings.length > 0) {
          setTimedWarning('Не в словаре: ' + msg.dictionaryWarnings.join(', '));
        } else if (warningTimer !== null) {
          clearTimeout(warningTimer);
          warningTimer = null;
          store.setWarning(null);
        }
        return;
      case 'moveRejected':
        store.setError(msg.reason);
        return;
      case 'error':
        if (msg.message === 'Slot taken' || msg.message === 'Wrong password' || msg.message === 'Wrong name for this slot') {
          store.clearIdentity();
        }
        store.setError(msg.message);
        return;
    }
  });

  ws.addEventListener('error', (e) => {
    console.warn('ws error:', e);
  });
  ws.addEventListener('close', () => {
    useGameStore.getState().setConnected(false);
    if (intentionalClose) {
      intentionalClose = false;
      return;
    }
    scheduleReconnect();
  });
}

export function disconnect(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (warningTimer !== null) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }
  if (socket !== null) {
    intentionalClose = true;
    socket.close();
    socket = null;
  }
}

export function send(msg: ClientMessage): void {
  if (socket !== null && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function sendJoin(slot: Slot, name: string, password: string): void {
  send({ type: 'join', slot, name, password });
}
