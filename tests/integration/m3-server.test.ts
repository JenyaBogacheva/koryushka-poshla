import { describe, it, expect } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GameState, ServerMessage } from '@shared/types';
import { startServer } from '../../server/index.js';

type Buffered = {
  ws: WebSocket;
  messages: ServerMessage[];
  waiters: Array<{ predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }>;
};

function buffered(url: string): Promise<Buffered> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const b: Buffered = { ws, messages: [], waiters: [] };
    ws.on('message', (raw: RawData) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      b.messages.push(msg);
      // Drain any matching waiters.
      b.waiters = b.waiters.filter((w) => {
        if (w.predicate(msg)) {
          w.resolve(msg);
          return false;
        }
        return true;
      });
    });
    ws.once('open', () => resolve(b));
    ws.once('error', reject);
  });
}

function waitFor<T extends ServerMessage>(b: Buffered, predicate: (m: ServerMessage) => m is T): Promise<T> {
  // Check buffer first.
  for (const m of b.messages) {
    if (predicate(m)) return Promise.resolve(m);
  }
  return new Promise((resolve) => {
    b.waiters.push({
      predicate: (m): boolean => predicate(m),
      resolve: (m) => resolve(m as T),
    });
  });
}

const isStateWithPhase = (phase: GameState['phase']) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> =>
    m.type === 'state' && m.state.phase === phase;

const isType = <T extends ServerMessage['type']>(t: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> => m.type === t;

async function freshServer() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-m3-'));
  const server = await startServer({ port: 0, serveStatic: false, dataDir });
  const url = (slot: number, name: string) =>
    `ws://localhost:${server.port}/ws?slot=${slot}&name=${encodeURIComponent(name)}`;
  return { server, url, dataDir };
}

describe('M3 server: seating and submitMove', () => {
  it('starts the game when all three slots seated, off-center first move is rejected', async () => {
    const { server, url } = await freshServer();
    try {
      const w0 = await buffered(url(0, 'A'));
      await waitFor(w0, isStateWithPhase('waiting'));

      const w1 = await buffered(url(1, 'B'));
      const w2 = await buffered(url(2, 'C'));

      const playing = await waitFor(w0, isStateWithPhase('playing'));
      expect(playing.state.players.map((p) => p.name)).toEqual(['A', 'B', 'C']);
      expect(playing.state.players.every((p) => p.rack.length === 7)).toBe(true);

      const myRack = playing.state.players[0]!.rack;
      // Off-center first move → first-move-must-cover-center rejection.
      const placements = [
        { tileId: myRack[0]!.id, row: 0, col: 0, playedAs: myRack[0]!.letter },
        { tileId: myRack[1]!.id, row: 0, col: 1, playedAs: myRack[1]!.letter },
      ];
      w0.ws.send(JSON.stringify({ type: 'submitMove', placements }));
      const rejected = await waitFor(w0, isType('moveRejected'));
      expect(rejected.reason).toBe('Первый ход должен закрывать центральную клетку');

      w0.ws.close();
      w1.ws.close();
      w2.ws.close();
    } finally {
      await server.close();
    }
  });

  it('accepts a valid first move and broadcasts the new state', async () => {
    const { server, url } = await freshServer();
    try {
      const w0 = await buffered(url(0, 'A'));
      const w1 = await buffered(url(1, 'B'));
      const w2 = await buffered(url(2, 'C'));
      const playing = await waitFor(w0, isStateWithPhase('playing'));

      // Find two non-blank tiles in slot 0's rack to place horizontally across center.
      const myRack = playing.state.players[0]!.rack;
      const real = myRack.filter((t) => !t.isBlank).slice(0, 2);
      expect(real.length).toBe(2);

      const placements = [
        { tileId: real[0]!.id, row: 7, col: 7, playedAs: real[0]!.letter },
        { tileId: real[1]!.id, row: 7, col: 8, playedAs: real[1]!.letter },
      ];
      w0.ws.send(JSON.stringify({ type: 'submitMove', placements }));

      const accepted = await waitFor(w0, isType('moveAccepted'));
      expect(accepted.moveRecord.slot).toBe(0);
      expect(accepted.moveRecord.placements.length).toBe(2);

      // All three clients should see a state where (7,7) is now occupied and turn is 1.
      const after = await waitFor(w2, (m): m is Extract<ServerMessage, { type: 'state' }> =>
        m.type === 'state' && m.state.turnIndex === 1,
      );
      expect(after.state.board[7]![7]).not.toBeNull();
      expect(after.state.board[7]![8]).not.toBeNull();

      w0.ws.close();
      w1.ws.close();
      w2.ws.close();
    } finally {
      await server.close();
    }
  });

  it('rejects submitMove from out-of-turn player', async () => {
    const { server, url } = await freshServer();
    try {
      const [w0, w1, w2] = await Promise.all([
        buffered(url(0, 'A')),
        buffered(url(1, 'B')),
        buffered(url(2, 'C')),
      ]);
      await waitFor(w1, isStateWithPhase('playing'));

      w1.ws.send(JSON.stringify({ type: 'submitMove', placements: [] }));
      const rejected = await waitFor(w1, isType('moveRejected'));
      expect(rejected.reason).toBe('Сейчас не ваш ход');

      w0.ws.close();
      w1.ws.close();
      w2.ws.close();
    } finally {
      await server.close();
    }
  });

  it('replies "not yet implemented" for stubbed actions', async () => {
    const { server, url } = await freshServer();
    try {
      const [w0, w1, w2] = await Promise.all([
        buffered(url(0, 'A')),
        buffered(url(1, 'B')),
        buffered(url(2, 'C')),
      ]);
      await waitFor(w0, isStateWithPhase('playing'));

      w0.ws.send(JSON.stringify({ type: 'pass' }));
      const err = await waitFor(w0, isType('error'));
      expect(err.message).toBe('not yet implemented');

      w0.ws.close();
      w1.ws.close();
      w2.ws.close();
    } finally {
      await server.close();
    }
  });

  it('rejects connection with mismatched name on a held slot', async () => {
    const { server, url } = await freshServer();
    try {
      const w0 = await buffered(url(0, 'A'));
      const wsBad = new WebSocket(url(0, 'B'));
      const closeReason = await new Promise<string>((resolve) => {
        wsBad.on('close', (_code, reason) => resolve(reason.toString()));
      });
      expect(closeReason).toBe('Slot taken');
      w0.ws.close();
    } finally {
      await server.close();
    }
  });

  it('allows reconnect with same name after disconnect', async () => {
    const { server, url } = await freshServer();
    try {
      const w0 = await buffered(url(0, 'A'));
      const w1 = await buffered(url(1, 'B'));
      const w2 = await buffered(url(2, 'C'));
      await waitFor(w0, isStateWithPhase('playing'));

      await new Promise<void>((resolve) => {
        w1.ws.on('close', () => resolve());
        w1.ws.close();
      });

      const w1b = await buffered(url(1, 'B'));
      const snap = await waitFor(w1b, isStateWithPhase('playing'));
      expect(snap.state.players[1]!.name).toBe('B');

      w0.ws.close();
      w1b.ws.close();
      w2.ws.close();
    } finally {
      await server.close();
    }
  });
});
