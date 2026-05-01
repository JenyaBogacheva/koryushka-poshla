import type { GameState } from '@shared/types';
import { useGameStore } from './store.js';

type ServerMessage = { type: 'state'; state: GameState };

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  const ws = new WebSocket(url);

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
    if (msg.type === 'state') {
      useGameStore.getState().setState(msg.state);
    } else {
      console.warn('unknown ws message type:', (msg as { type: unknown }).type);
    }
  });

  // 'close' always fires after a connection ends, including after 'error'. Listening to
  // both would schedule two reconnects per socket. Log errors for visibility, reconnect on close.
  ws.addEventListener('error', (e) => {
    console.warn('ws error:', e);
  });
  ws.addEventListener('close', () => {
    useGameStore.getState().setConnected(false);
    scheduleReconnect();
  });
}
