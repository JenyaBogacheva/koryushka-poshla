import { describe, it, expect } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClientMessage, GameState, ServerMessage } from '@shared/types';
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
  for (const m of b.messages) if (predicate(m)) return Promise.resolve(m);
  return new Promise((resolve) => {
    b.waiters.push({ predicate: (m): boolean => predicate(m), resolve: (m) => resolve(m as T) });
  });
}

const isType = <T extends ServerMessage['type']>(t: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> => m.type === t;
const isStateWithPhase = (phase: GameState['phase']) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> =>
    m.type === 'state' && m.state.phase === phase;

function send(b: Buffered, msg: ClientMessage): void {
  b.ws.send(JSON.stringify(msg));
}
function join(b: Buffered, slot: 0 | 1 | 2, name: string, password = 'pw'): void {
  send(b, { type: 'join', slot, name, password });
}

const FAMILY = {
  password: 'pw',
  players: [
    { slot: 0, name: 'A' },
    { slot: 1, name: 'B' },
    { slot: 2, name: 'C' },
  ],
};

async function freshServer() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-m4-'));
  writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify(FAMILY));
  const server = await startServer({ port: 0, serveStatic: false, dataDir });
  const url = `ws://localhost:${server.port}/ws`;
  return { server, url, dataDir };
}

describe('M4a server: lobby → join → state', () => {
  it('sends lobby on connect; rejects non-join messages with "Join first"', async () => {
    const { server, url } = await freshServer();
    try {
      const b = await buffered(url);
      const lobby = await waitFor(b, isType('lobby'));
      expect(lobby.slots.map((s) => s.name)).toEqual(['A', 'B', 'C']);
      expect(lobby.slots.every((s) => !s.connected)).toBe(true);

      send(b, { type: 'submitMove', placements: [] });
      const err = await waitFor(b, isType('error'));
      expect(err.message).toBe('Join first');
      expect(b.ws.readyState).toBe(WebSocket.OPEN);

      b.ws.close();
    } finally {
      await server.close();
    }
  });

  it('starts the game when all three slots have joined', async () => {
    const { server, url } = await freshServer();
    try {
      const [b0, b1, b2] = await Promise.all([buffered(url), buffered(url), buffered(url)]);
      await waitFor(b0, isType('lobby'));
      join(b0, 0, 'A');
      join(b1, 1, 'B');
      join(b2, 2, 'C');

      const playing = await waitFor(b0, isStateWithPhase('playing'));
      expect(playing.state.players.map((p) => p.name)).toEqual(['A', 'B', 'C']);
      expect(playing.state.players.every((p) => p.rack.length === 7)).toBe(true);

      b0.ws.close();
      b1.ws.close();
      b2.ws.close();
    } finally {
      await server.close();
    }
  });

  it('live same-name takeover: closes existing ws, seats the new one', async () => {
    const { server, url } = await freshServer();
    try {
      const b0 = await buffered(url);
      await waitFor(b0, isType('lobby'));
      join(b0, 0, 'A');
      await waitFor(b0, isType('state'));

      const closed = new Promise<void>((resolve) => b0.ws.on('close', () => resolve()));

      const b0b = await buffered(url);
      await waitFor(b0b, isType('lobby'));
      join(b0b, 0, 'A');
      await waitFor(b0b, isType('state'));

      await closed;
      b0b.ws.close();
    } finally {
      await server.close();
    }
  });

  it('rejects wrong-name-for-slot from family config', async () => {
    const { server, url } = await freshServer();
    try {
      const bad = await buffered(url);
      await waitFor(bad, isType('lobby'));
      join(bad, 0, 'NotA');
      const err = await waitFor(bad, isType('error'));
      expect(err.message).toBe('Wrong name for this slot');
      const closed = await new Promise<number>((resolve) => bad.ws.on('close', (code) => resolve(code)));
      expect(closed).toBe(1008);
    } finally {
      await server.close();
    }
  });

  it('rejects wrong password', async () => {
    const { server, url } = await freshServer();
    try {
      const bad = await buffered(url);
      await waitFor(bad, isType('lobby'));
      send(bad, { type: 'join', slot: 0, name: 'A', password: 'nope' });
      const err = await waitFor(bad, isType('error'));
      expect(err.message).toBe('Wrong password');
    } finally {
      await server.close();
    }
  });

  it('reconnect-by-name after disconnect', async () => {
    const { server, url } = await freshServer();
    try {
      const [b0, b1, b2] = await Promise.all([buffered(url), buffered(url), buffered(url)]);
      await waitFor(b0, isType('lobby'));
      join(b0, 0, 'A'); join(b1, 1, 'B'); join(b2, 2, 'C');
      await waitFor(b0, isStateWithPhase('playing'));

      await new Promise<void>((resolve) => {
        b1.ws.on('close', () => resolve());
        b1.ws.close();
      });

      const b1b = await buffered(url);
      await waitFor(b1b, isType('lobby'));
      join(b1b, 1, 'B');
      const snap = await waitFor(b1b, isStateWithPhase('playing'));
      expect(snap.state.players[1]!.name).toBe('B');

      b0.ws.close();
      b1b.ws.close();
      b2.ws.close();
    } finally {
      await server.close();
    }
  });

  it('accepts a valid first submitMove (covers center)', async () => {
    const { server, url } = await freshServer();
    try {
      const [b0, b1, b2] = await Promise.all([buffered(url), buffered(url), buffered(url)]);
      await waitFor(b0, isType('lobby'));
      join(b0, 0, 'A'); join(b1, 1, 'B'); join(b2, 2, 'C');
      const playing = await waitFor(b0, isStateWithPhase('playing'));

      const r0 = playing.state.players[0]!.rack;
      const real = r0.filter((t) => !t.isBlank).slice(0, 2);
      send(b0, {
        type: 'submitMove',
        placements: [
          { tileId: real[0]!.id, row: 7, col: 7, playedAs: real[0]!.letter },
          { tileId: real[1]!.id, row: 7, col: 8, playedAs: real[1]!.letter },
        ],
      });
      const accepted = await waitFor(b0, isType('moveAccepted'));
      expect(accepted.moveRecord.placements.length).toBe(2);

      b0.ws.close(); b1.ws.close(); b2.ws.close();
    } finally {
      await server.close();
    }
  });

  it('replies "not yet implemented" for the still-stubbed toggleRackVisible', async () => {
    const { server, url } = await freshServer();
    try {
      const [b0, b1, b2] = await Promise.all([buffered(url), buffered(url), buffered(url)]);
      await waitFor(b0, isType('lobby'));
      join(b0, 0, 'A'); join(b1, 1, 'B'); join(b2, 2, 'C');
      await waitFor(b0, isStateWithPhase('playing'));

      send(b0, { type: 'toggleRackVisible', visible: false });
      const err = await waitFor(b0, isType('error'));
      expect(err.message).toBe('not yet implemented');

      b0.ws.close(); b1.ws.close(); b2.ws.close();
    } finally {
      await server.close();
    }
  });

});
