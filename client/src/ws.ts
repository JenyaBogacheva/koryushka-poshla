import type { GameState } from '@shared/types';
import { useGameStore } from './store.js';

type ServerMessage = { type: 'state'; state: GameState } | { type: string };

const RECONNECT_DELAY_MS = 1000;

export function connect(): void {
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  const ws = new WebSocket(url);

  ws.addEventListener('open', () => useGameStore.getState().setConnected(true));

  ws.addEventListener('message', (e) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(e.data) as ServerMessage;
    } catch {
      console.warn('non-JSON ws message:', e.data);
      return;
    }
    if (msg.type === 'state' && 'state' in msg) {
      useGameStore.getState().setState(msg.state);
    } else {
      console.warn('unknown ws message type:', msg.type);
    }
  });

  const onDown = (): void => {
    useGameStore.getState().setConnected(false);
    setTimeout(connect, RECONNECT_DELAY_MS);
  };
  ws.addEventListener('close', onDown);
  ws.addEventListener('error', onDown);
}
