import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';
import type { GameState } from '@shared/types';
import { startServer } from '../../server/index.js';

type Msg = { type: 'state'; state: GameState };

function openWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function collectUntil(ws: WebSocket, until: (msg: Msg) => boolean): Promise<Msg[]> {
  return new Promise((resolve, reject) => {
    const received: Msg[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as Msg;
      if (msg.type !== 'state') return;
      received.push(msg);
      if (until(msg)) {
        ws.close();
        resolve(received);
      }
    });
    ws.on('error', reject);
  });
}

describe('M2 server: scripted runner over WS', () => {
  it('broadcasts a state snapshot after every mutation, ending in phase=finished', async () => {
    const server = await startServer({ port: 0, delayMs: 0, serveStatic: false });
    try {
      const ws = await openWs(`ws://localhost:${server.port}/ws`);
      const collected = collectUntil(ws, (m) => m.state.phase === 'finished');
      const runDone = server.start();

      const messages = await collected;
      await runDone;

      const first = messages[0]!;
      expect(first.state.phase).toBe('playing');
      expect(first.state.players.map((p) => p.name)).toEqual(['Женя', 'Мама', 'Папа']);

      const last = messages[messages.length - 1]!;
      expect(last.state.phase).toBe('finished');
      expect(last.state.history.length).toBeGreaterThan(0);

      // At least: 1 initial post-startGame snapshot + 9 per-turn snapshots + 1 endGame snapshot.
      expect(messages.length).toBeGreaterThanOrEqual(11);

      // History length is monotonically non-decreasing across snapshots — proves we get
      // a fresh snapshot for every mutation in the runner, not just the start and the end.
      let prevHistoryLen = 0;
      for (const m of messages) {
        expect(m.state.history.length).toBeGreaterThanOrEqual(prevHistoryLen);
        prevHistoryLen = m.state.history.length;
      }
    } finally {
      await server.close();
    }
  });
});
