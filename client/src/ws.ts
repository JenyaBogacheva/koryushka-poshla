import type { ClientMessage, ServerMessage } from '@shared/types';
import { useGameStore } from './store.js';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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

export function connect(): void {
  const { mySlot, myName } = useGameStore.getState();
  if (mySlot === null || myName === null) {
    console.warn('[ws] connect called before identity was set');
    return;
  }
  if (socket !== null && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  intentionalClose = false;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws?slot=${mySlot}&name=${encodeURIComponent(myName)}`;
  const ws = new WebSocket(url);
  socket = ws;

  ws.addEventListener('open', () => {
    reconnectAttempts = 0;
    useGameStore.getState().setConnected(true);
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
      case 'state': {
        store.setState(msg.state);
        // Drop any pending placements that reference tiles no longer in my rack.
        const after = useGameStore.getState();
        if (after.mySlot !== null && after.pendingPlacements.length > 0) {
          const myRackIds = new Set(msg.state.players[after.mySlot]!.rack.map((t) => t.id));
          const next = after.pendingPlacements.filter((p) => myRackIds.has(p.tileId));
          if (next.length !== after.pendingPlacements.length) {
            useGameStore.setState({ pendingPlacements: next });
          }
        }
        return;
      }
      case 'moveAccepted':
        store.clearPending();
        return;
      case 'moveRejected':
        store.setError(msg.reason);
        return;
      case 'error':
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
