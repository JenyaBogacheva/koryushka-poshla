import type { ClientMessage, ServerMessage, Slot, Placement } from '@shared/types';
import { useGameStore } from './store.js';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const WARNING_TIMEOUT_MS = 5000;

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let warningTimer: ReturnType<typeof setTimeout> | null = null;
let socket: WebSocket | null = null;
let lastFlashedMoveTs = 0;

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
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In dev, Vite serves on :5173 and proxies /ws to Express on :3000. The proxy is flaky
  // (ECONNRESET on HMR cycles), so connect directly when we recognize the dev port.
  const isDev = location.port === '5173';
  const host = isDev ? `${location.hostname}:3000` : location.host;
  const url = `${proto}//${host}/ws`;
  const ws = new WebSocket(url);
  socket = ws;

  ws.addEventListener('open', () => {
    if (socket !== ws) return;
    reconnectAttempts = 0;
    useGameStore.getState().setConnected(true);
    const { identity } = useGameStore.getState();
    if (identity !== null) sendJoin(identity.slot, identity.name, identity.password);
  });

  ws.addEventListener('message', (e) => {
    if (socket !== ws) return;
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
        const FRESH_MS = 5000;
        const events = msg.state.events;
        const last = events[events.length - 1];
        // Skip moves we've already flashed for so reconnects/reloads inside the freshness
        // window don't replay the animation on already-committed tiles.
        if (
          last !== undefined &&
          last.kind === 'move' &&
          last.timestamp > lastFlashedMoveTs &&
          Date.now() - last.timestamp < FRESH_MS
        ) {
          const cells = last.placements.map((p) => ({ row: p.row, col: p.col }));
          lastFlashedMoveTs = last.timestamp;
          useGameStore.getState().setLastPlaced(cells, Date.now());
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
      case 'movePreview':
        store.setMovePreview(msg.preview);
        return;
      case 'error':
        // Any error while still in the join phase (no game state yet) means the join was refused.
        // Bounce back to the picker by clearing identity.
        if (store.state === null) {
          store.clearIdentity();
        }
        store.setError(msg.message);
        return;
    }
  });

  ws.addEventListener('error', (e) => {
    if (socket !== ws) return;
    console.warn('ws error:', e);
  });
  ws.addEventListener('close', (ev) => {
    if (socket !== ws) return;   // a previous (replaced) socket closing — ignore.
    socket = null;
    const store = useGameStore.getState();
    store.setConnected(false);
    if (ev.reason === 'replaced by same-name client') {
      // Another tab took over this slot. Don't reconnect — that would just bounce them right back.
      store.clearIdentity();
      store.setError('Слот занят в другой вкладке');
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
    const old = socket;
    socket = null;          // detach first; the close listener on `old` checks `socket !== ws` and bails.
    old.close();
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

export function sendPass(): void { send({ type: 'pass' }); }
export function sendRedraw(): void { send({ type: 'redraw' }); }
export function sendSwapAll(): void { send({ type: 'swapAll' }); }
export function sendClaimBlank(row: number, col: number, tileId: string): void {
  send({ type: 'claimBlank', row, col, myTileId: tileId });
}
export function sendEndGame(): void { send({ type: 'endGame' }); }
export function sendRevertLastTurn(): void { send({ type: 'revertLastTurn' }); }
export function sendNewGame(): void { send({ type: 'newGame' }); }
export function sendDrawTile(): void { send({ type: 'drawTile' }); }
export function sendPreviewMove(placements: Placement[]): void {
  send({ type: 'previewMove', placements });
}
export function sendSubmitMove(placements: Placement[]): void {
  send({ type: 'submitMove', placements });
}
export function sendGiveAssist(toSlot: Slot): void {
  send({ type: 'giveAssist', toSlot });
}
export function sendSuggestWord(word: string): void {
  send({ type: 'suggestWord', word });
}
export function sendRequestHelp(): void {
  send({ type: 'requestHelp' });
}
