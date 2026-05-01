import { describe, it, expect } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClientMessage, GameState, ServerMessage, GameArchive } from '@shared/types';
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

const isStateWithPhase = (phase: GameState['phase']) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> =>
    m.type === 'state' && m.state.phase === phase;

function send(b: Buffered, msg: ClientMessage): void { b.ws.send(JSON.stringify(msg)); }
function join(b: Buffered, slot: 0 | 1 | 2, name: string): void {
  send(b, { type: 'join', slot, name, password: 'pw' });
}

const FAMILY = { password: 'pw', players: [
  { slot: 0, name: 'A' }, { slot: 1, name: 'B' }, { slot: 2, name: 'C' },
] };

async function freshServer() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-m5a-'));
  writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify(FAMILY));
  const server = await startServer({ port: 0, serveStatic: false, dataDir });
  return { server, url: `ws://localhost:${server.port}/ws`, dataDir, port: server.port };
}

async function threeJoined() {
  const ctx = await freshServer();
  const a = await buffered(ctx.url); join(a, 0, 'A');
  const b = await buffered(ctx.url); join(b, 1, 'B');
  const c = await buffered(ctx.url); join(c, 2, 'C');
  await waitFor(a, isStateWithPhase('playing'));
  await waitFor(b, isStateWithPhase('playing'));
  await waitFor(c, isStateWithPhase('playing'));
  return { ...ctx, a, b, c };
}

async function arrangeArchived() {
  const ctx = await threeJoined();
  send(ctx.a, { type: 'endGame' });
  await waitFor(ctx.b, isStateWithPhase('finished'));
  // Give the server a tick to complete archiving.
  await new Promise<void>((r) => setTimeout(r, 50));
  return ctx;
}

describe('M5a — archive + history endpoints', () => {
  it('endGame archives a flat GameArchive and clears game.json', async () => {
    const ctx = await threeJoined();
    try {
      send(ctx.a, { type: 'endGame' });
      await waitFor(ctx.b, isStateWithPhase('finished'));
      // Give the server a tick to complete archiving.
      await new Promise<void>((r) => setTimeout(r, 50));

      // game.json must be gone
      expect(existsSync(path.join(ctx.dataDir, 'game.json'))).toBe(false);

      // exactly one file in history/
      const histDir = path.join(ctx.dataDir, 'history');
      const files = readdirSync(histDir).filter((f) => f.endsWith('.json'));
      expect(files).toHaveLength(1);

      // the file must be a flat GameArchive (has finalBoard and events, no summary wrapper)
      const { default: fs } = await import('node:fs');
      const raw = JSON.parse(fs.readFileSync(path.join(histDir, files[0]!), 'utf-8')) as unknown;
      const archive = raw as GameArchive;
      expect(archive).toHaveProperty('id');
      expect(archive).toHaveProperty('finalBoard');
      expect(archive).toHaveProperty('events');
      expect(archive).not.toHaveProperty('summary');
      expect(Array.isArray(archive.finalBoard)).toBe(true);
      expect(Array.isArray(archive.events)).toBe(true);
    } finally { await ctx.server.close(); }
  });

  it('GET /api/history returns the summary list', async () => {
    const ctx = await arrangeArchived();
    try {
      const res = await fetch(`http://localhost:${ctx.port}/api/history`);
      expect(res.status).toBe(200);
      const summaries = await res.json() as unknown[];
      expect(Array.isArray(summaries)).toBe(true);
      expect(summaries).toHaveLength(1);
      const s = summaries[0] as Record<string, unknown>;
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('startedAt');
      expect(s).toHaveProperty('finishedAt');
      expect(s).toHaveProperty('players');
      expect(s).toHaveProperty('winnerSlot');
    } finally { await ctx.server.close(); }
  });

  it('GET /api/history/:id returns the full GameArchive', async () => {
    const ctx = await arrangeArchived();
    try {
      // get id from summary list first
      const listRes = await fetch(`http://localhost:${ctx.port}/api/history`);
      const summaries = await listRes.json() as Array<{ id: string }>;
      const id = summaries[0]!.id;

      const res = await fetch(`http://localhost:${ctx.port}/api/history/${id}`);
      expect(res.status).toBe(200);
      const archive = await res.json() as GameArchive;
      expect(archive.id).toBe(id);
      expect(Array.isArray(archive.finalBoard)).toBe(true);
      expect(archive.finalBoard).toHaveLength(15);
      expect(Array.isArray(archive.events)).toBe(true);
    } finally { await ctx.server.close(); }
  });

  it('GET /api/history/:id 404s for unknown id', async () => {
    const ctx = await freshServer();
    try {
      const res = await fetch(`http://localhost:${ctx.port}/api/history/g-does-not-exist`);
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('not found');
    } finally { await ctx.server.close(); }
  });
});
