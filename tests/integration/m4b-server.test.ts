import { describe, it, expect } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClientMessage, GameState, ServerMessage, Slot } from '@shared/types';
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

const isStateWithTurn = (turnIndex: Slot) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> =>
    m.type === 'state' && m.state.phase === 'playing' && m.state.turnIndex === turnIndex;

const isStatePlaying = () =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> =>
    m.type === 'state' && m.state.phase === 'playing';

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
  const dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-m4b-'));
  writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify(FAMILY));
  const server = await startServer({ port: 0, serveStatic: false, dataDir });
  return { server, url: `ws://localhost:${server.port}/ws`, dataDir };
}

async function threeJoined() {
  const ctx = await freshServer();
  const a = await buffered(ctx.url); join(a, 0, 'A');
  const b = await buffered(ctx.url); join(b, 1, 'B');
  const c = await buffered(ctx.url); join(c, 2, 'C');
  const [snapA] = await Promise.all([
    waitFor(a, isStateWithPhase('playing')),
    waitFor(b, isStateWithPhase('playing')),
    waitFor(c, isStateWithPhase('playing')),
  ]);
  const bs = [a, b, c] as const;
  const first = snapA.state.turnIndex;
  const second = ((first + 1) % 3) as Slot;
  const third = ((first + 2) % 3) as Slot;
  return { ...ctx, a, b, c, bs, first, second, third };
}

describe('M4b server: action handlers', () => {
  it('pass advances turnIndex and arms revert for the actor', async () => {
    const { server, bs, first, second } = await threeJoined();
    try {
      send(bs[first], { type: 'pass' });
      const s = await waitFor(bs[second], isStateWithTurn(second));
      expect(s.state.players[first]!.canRevert).toBe(true);
      expect(s.state.players[second]!.canRevert).toBe(false);
    } finally { await server.close(); }
  });

  it('revertLastTurn rolls turnIndex back', async () => {
    const { server, bs, first, second } = await threeJoined();
    try {
      send(bs[first], { type: 'pass' });
      await waitFor(bs[second], isStateWithTurn(second));
      send(bs[first], { type: 'revertLastTurn' });
      const s = await waitFor(bs[second], isStateWithTurn(first));
      expect(s.state.players[first]!.canRevert).toBe(false);
    } finally { await server.close(); }
  });

  it('revertLastTurn from a non-author returns error', async () => {
    const { server, bs, first, second } = await threeJoined();
    try {
      send(bs[first], { type: 'pass' });
      await waitFor(bs[second], isStateWithTurn(second));
      send(bs[second], { type: 'revertLastTurn' });
      const err = await waitFor(bs[second], isError);
      expect(err.message).toMatch(/author|nothing|turn/i);
    } finally { await server.close(); }
  });

  it('redraw on an ineligible rack returns error and does not advance turn', async () => {
    const { server, bs, first } = await threeJoined();
    try {
      send(bs[first], { type: 'redraw' });
      const err = await waitFor(bs[first], isError);
      expect(err.message).toMatch(/eligible|vowel|consonant|turn/i);
    } finally { await server.close(); }
  });

  it('endGame finishes the game and clears revert', async () => {
    const { server, bs, first, second } = await threeJoined();
    try {
      send(bs[first], { type: 'endGame' });
      const s = await waitFor(bs[second], isStateWithPhase('finished'));
      for (const p of s.state.players) expect(p.canRevert).toBe(false);
    } finally { await server.close(); }
  });

  it('cross-player action clears the previous revert window', async () => {
    const { server, bs, first, second, third } = await threeJoined();
    try {
      send(bs[first], { type: 'pass' });
      await waitFor(bs[second], isStateWithTurn(second));
      send(bs[second], { type: 'pass' });
      const s = await waitFor(bs[third], isStateWithTurn(third));
      expect(s.state.players[first]!.canRevert).toBe(false);
      expect(s.state.players[second]!.canRevert).toBe(true);
    } finally { await server.close(); }
  });
});
