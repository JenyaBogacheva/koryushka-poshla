import { describe, it, expect } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClientMessage, GameState, ServerMessage } from '@shared/types';
import { startServer } from '../server/index.js';

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
      b.waiters = b.waiters.filter((w) => {
        if (w.predicate(msg)) { w.resolve(msg); return false; }
        return true;
      });
    });
    ws.once('open', () => resolve(b));
    ws.once('error', reject);
  });
}

function waitFor<T extends ServerMessage>(b: Buffered, predicate: (m: ServerMessage) => m is T): Promise<T> {
  for (const m of b.messages) if (predicate(m)) return Promise.resolve(m);
  return new Promise((resolve) => {
    b.waiters.push({ predicate: (m): boolean => predicate(m), resolve: (m) => resolve(m as T) });
  });
}

const isStateWithPhase = (phase: GameState['phase']) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> =>
    m.type === 'state' && m.state.phase === phase;

const isError = (m: ServerMessage): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error';

function send(b: Buffered, msg: ClientMessage): void { b.ws.send(JSON.stringify(msg)); }
function join(b: Buffered, slot: 0 | 1 | 2, name: string): void {
  send(b, { type: 'join', slot, name, password: 'pw' });
}

const FAMILY = { password: 'pw', players: [
  { slot: 0, name: 'A' }, { slot: 1, name: 'B' }, { slot: 2, name: 'C' },
] };

async function freshServer() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-newgame-'));
  writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify(FAMILY));
  const server = await startServer({ port: 0, serveStatic: false, dataDir });
  return { server, url: `ws://localhost:${server.port}/ws`, dataDir };
}

async function threeJoined() {
  const ctx = await freshServer();
  const a = await buffered(ctx.url); join(a, 0, 'A');
  const b = await buffered(ctx.url); join(b, 1, 'B');
  const c = await buffered(ctx.url); join(c, 2, 'C');
  await Promise.all([
    waitFor(a, isStateWithPhase('playing')),
    waitFor(b, isStateWithPhase('playing')),
    waitFor(c, isStateWithPhase('playing')),
  ]);
  return { ...ctx, a, b, c };
}

async function arrangeFinished() {
  const ctx = await threeJoined();
  send(ctx.a, { type: 'endGame' });
  await waitFor(ctx.b, isStateWithPhase('finished'));
  // Wait for archive to complete: next state broadcast will be the fresh lobby snapshot (phase 'waiting')
  await waitFor(ctx.b, isStateWithPhase('waiting'));
  return ctx;
}

describe('server: newGame action', () => {
  it('after endGame + newGame, snapshot is fresh (empty board, scores 0, first event is drawForOrder)', async () => {
    const ctx = await arrangeFinished();
    try {
      send(ctx.a, { type: 'newGame' });
      const snap = await waitFor(ctx.b, isStateWithPhase('playing'));
      // Board is empty
      expect(snap.state.board.every((row) => row.every((cell) => cell === null))).toBe(true);
      // Scores are 0
      for (const p of snap.state.players) expect(p.score).toBe(0);
      // First event is drawForOrder
      expect(snap.state.events[0]?.kind).toBe('drawForOrder');
      // Each player has 7 tiles
      for (const p of snap.state.players) expect(p.rack.length).toBe(7);

      ctx.a.ws.close(); ctx.b.ws.close(); ctx.c.ws.close();
    } finally { await ctx.server.close(); }
  });

  it('newGame while a game is in progress is a no-op', async () => {
    const ctx = await threeJoined();
    try {
      // Capture current events length
      const before = ctx.a.messages.filter((m) => m.type === 'state' && m.state.phase === 'playing').at(-1) as
        Extract<ServerMessage, { type: 'state' }> | undefined;
      const eventsBefore = before?.state.events.length ?? 0;

      send(ctx.a, { type: 'newGame' });
      // No new state message should arrive (give a small tick to detect any spurious messages)
      await new Promise<void>((r) => setTimeout(r, 50));

      const after = ctx.a.messages.filter((m) => m.type === 'state' && m.state.phase === 'playing').at(-1) as
        Extract<ServerMessage, { type: 'state' }> | undefined;
      // If a new state was broadcast, events length should not reset
      if (after) expect(after.state.events.length).toBeGreaterThanOrEqual(eventsBefore);

      ctx.a.ws.close(); ctx.b.ws.close(); ctx.c.ws.close();
    } finally { await ctx.server.close(); }
  });

  it('two rapid newGame messages produce one new game (second is ignored)', async () => {
    const ctx = await arrangeFinished();
    try {
      send(ctx.a, { type: 'newGame' });
      send(ctx.a, { type: 'newGame' });

      const snap = await waitFor(ctx.b, isStateWithPhase('playing'));
      expect(snap.state.events[0]?.kind).toBe('drawForOrder');
      // Only one drawForOrder event (not two games started)
      const drawEvents = snap.state.events.filter((e) => e.kind === 'drawForOrder');
      expect(drawEvents).toHaveLength(1);

      ctx.a.ws.close(); ctx.b.ws.close(); ctx.c.ws.close();
    } finally { await ctx.server.close(); }
  });
});
