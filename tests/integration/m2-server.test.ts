import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';
import type { GameState } from '@shared/types';
import { startServer } from '../../server/index.js';

type Msg = { type: 'state'; state: GameState };

function collectMessages(url: string, until: (msg: Msg) => boolean): Promise<Msg[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
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
      const url = `ws://localhost:${server.port}/ws`;
      const messages = await collectMessages(url, (m) => m.state.phase === 'finished');

      // First message: phase 'playing', three named players.
      const first = messages[0]!;
      expect(first.state.phase).toBe('playing');
      expect(first.state.players.map((p) => p.name)).toEqual(['Женя', 'Мама', 'Папа']);

      // Last message: phase 'finished' with a populated history.
      const last = messages[messages.length - 1]!;
      expect(last.state.phase).toBe('finished');
      expect(last.state.history.length).toBeGreaterThan(0);

      // Scores never decrease over the snapshot stream.
      for (let slot = 0 as 0 | 1 | 2; slot < 3; slot = (slot + 1) as 0 | 1 | 2) {
        let prev = 0;
        for (const m of messages) {
          const score = m.state.players[slot]!.score;
          expect(score).toBeGreaterThanOrEqual(prev);
          prev = score;
        }
      }

      await server.done;
    } finally {
      await server.close();
    }
  });
});
