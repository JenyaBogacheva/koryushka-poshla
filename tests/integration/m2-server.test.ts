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

      for (let slot = 0 as 0 | 1 | 2; slot < 3; slot = (slot + 1) as 0 | 1 | 2) {
        let prev = 0;
        for (const m of messages) {
          const score = m.state.players[slot]!.score;
          expect(score).toBeGreaterThanOrEqual(prev);
          prev = score;
        }
      }
    } finally {
      await server.close();
    }
  });
});
