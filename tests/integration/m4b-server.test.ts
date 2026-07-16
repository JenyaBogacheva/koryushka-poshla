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

const isLiveDraft = (m: ServerMessage): m is Extract<ServerMessage, { type: 'liveDraft' }> => m.type === 'liveDraft';

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

// Drive the draw-for-order to completion, handling possible tiebreak rounds.
async function driveDraws(bs: readonly [Buffered, Buffered, Buffered]): Promise<void> {
  const sentRound = new Map<number, Set<number>>();
  while (true) {
    const latest = bs[0].messages.filter((m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state').at(-1);
    if (latest && latest.state.phase === 'playing') return;
    if (!latest || latest.state.phase !== 'drawing') {
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }
    const drawState = latest.state.drawState!;
    let sent = sentRound.get(drawState.round);
    if (!sent) { sent = new Set(); sentRound.set(drawState.round, sent); }
    for (const slot of drawState.candidates) {
      if (sent.has(slot)) continue;
      send(bs[slot], { type: 'drawTile' });
      sent.add(slot);
    }
    // Wait for next state broadcast that advances things.
    const before = bs[0].messages.length;
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (bs[0].messages.length > before) resolve();
        else setTimeout(check, 5);
      };
      check();
    });
  }
}

async function threeJoined() {
  const ctx = await freshServer();
  const a = await buffered(ctx.url); join(a, 0, 'A');
  const b = await buffered(ctx.url); join(b, 1, 'B');
  const c = await buffered(ctx.url); join(c, 2, 'C');
  const bs0 = [a, b, c] as const;
  await driveDraws(bs0);
  const [snapA] = await Promise.all([
    waitFor(a, isStateWithPhase('playing')),
    waitFor(b, isStateWithPhase('playing')),
    waitFor(c, isStateWithPhase('playing')),
  ]);
  const bs = [a, b, c] as const;
  // Turn order is decided by the draw, not seat order.
  const [first, second, third] = snapA.state.turnOrder;
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

  it('drawTile records the player\'s draw and broadcasts updated drawState', async () => {
    const ctx = await freshServer();
    try {
      const a = await buffered(ctx.url); join(a, 0, 'A');
      const b = await buffered(ctx.url); join(b, 1, 'B');
      const c = await buffered(ctx.url); join(c, 2, 'C');
      await waitFor(a, isStateWithPhase('drawing'));

      send(a, { type: 'drawTile' });
      const afterA = await waitFor(a, (m): m is Extract<ServerMessage, { type: 'state' }> =>
        m.type === 'state' && m.state.drawState !== null && m.state.drawState.draws.some((d) => d.slot === 0));
      expect(afterA.state.drawState!.draws.find((d) => d.slot === 0)).toBeDefined();

      // Other players also see the broadcast
      const seenOnB = await waitFor(b, (m): m is Extract<ServerMessage, { type: 'state' }> =>
        m.type === 'state' && m.state.drawState !== null && m.state.drawState.draws.some((d) => d.slot === 0));
      expect(seenOnB.state.drawState!.draws.find((d) => d.slot === 0)).toBeDefined();

      // A second drawTile from the same slot is rejected
      send(a, { type: 'drawTile' });
      const err = await waitFor(a, isError);
      expect(err.message).toMatch(/already|drawn|drawing|slot/i);

      a.ws.close(); b.ws.close(); c.ws.close();
    } finally { await ctx.server.close(); }
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

  it('previewMove mirrors the draft to the other two players as liveDraft', async () => {
    const { server, bs, first, second, third } = await threeJoined();
    try {
      const latest = bs[first].messages.filter(isStatePlaying()).at(-1)!;
      const tile = latest.state.players[first]!.rack[0]!;
      const placements = [
        { tileId: tile.id, row: 7, col: 7, playedAs: tile.isBlank ? 'А' : tile.letter },
      ];
      send(bs[first], { type: 'previewMove', placements });

      const [toSecond, toThird] = await Promise.all([
        waitFor(bs[second], isLiveDraft),
        waitFor(bs[third], isLiveDraft),
      ]);
      expect(toSecond.slot).toBe(first);
      expect(toSecond.placements).toEqual(placements);
      expect(toThird.slot).toBe(first);
      // The acting player drives their own board locally — no self-mirror.
      expect(bs[first].messages.some((m) => m.type === 'liveDraft')).toBe(false);
    } finally { await server.close(); }
  });

  it('previewMove with empty placements broadcasts an empty liveDraft (clears the mirror)', async () => {
    const { server, bs, first, second } = await threeJoined();
    try {
      send(bs[first], { type: 'previewMove', placements: [] });
      const cleared = await waitFor(bs[second], isLiveDraft);
      expect(cleared.slot).toBe(first);
      expect(cleared.placements).toEqual([]);
    } finally { await server.close(); }
  });

  it('previewMove from a player whose turn it is not does not broadcast a liveDraft', async () => {
    const { server, bs, first, second, third } = await threeJoined();
    try {
      // `second` is not on turn; their preview must not leak to the others.
      send(bs[second], { type: 'previewMove', placements: [] });
      await new Promise((r) => setTimeout(r, 40));
      expect(bs[first].messages.some((m) => m.type === 'liveDraft')).toBe(false);
      expect(bs[third].messages.some((m) => m.type === 'liveDraft')).toBe(false);
    } finally { await server.close(); }
  });
});

describe('integration — cool-word swap', () => {
  function latestState(b: Buffered) {
    return b.messages.filter((m): m is Extract<ServerMessage, { type: 'state' }> => m.type === 'state').at(-1)!;
  }

  it('offer then accept moves tiles and applies −5/+5', async () => {
    const { server, url } = await freshServer();
    const bs = [await buffered(url), await buffered(url), await buffered(url)] as const;
    join(bs[0], 0, 'A'); join(bs[1], 1, 'B'); join(bs[2], 2, 'C');
    await driveDraws(bs);
    await waitFor(bs[0], isStatePlaying());

    const st = latestState(bs[0]).state;
    const from = st.turnIndex;
    const to = ((from + 1) % 3) as Slot;
    const giveTileId = st.players[from]!.rack[0]!.id;
    const takeTileId = st.players[to]!.rack[0]!.id;

    send(bs[from], { type: 'offerSwap', toSlot: to, giveTileId, takeTileId, word: 'КОРЮШКА' });
    await waitFor(bs[to], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap !== null);

    send(bs[to], { type: 'respondSwap', accept: true });
    await waitFor(bs[from], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap === null && m.state.players[from]!.score === -5);

    const final = latestState(bs[from]).state;
    expect(final.players[from]!.score).toBe(-5);
    expect(final.players[to]!.score).toBe(5);
    expect(final.players[from]!.rack.some((t) => t.id === takeTileId)).toBe(true);
    expect(final.events.some((e) => e.kind === 'swap')).toBe(true);

    await server.close();
  });

  it('offer then cancel lets the same player offer again', async () => {
    const { server, url } = await freshServer();
    const bs = [await buffered(url), await buffered(url), await buffered(url)] as const;
    join(bs[0], 0, 'A'); join(bs[1], 1, 'B'); join(bs[2], 2, 'C');
    await driveDraws(bs);
    await waitFor(bs[0], isStatePlaying());

    const st = latestState(bs[0]).state;
    const from = st.turnIndex;
    const to = ((from + 1) % 3) as Slot;
    const giveTileId = st.players[from]!.rack[0]!.id;
    const takeTileId = st.players[to]!.rack[0]!.id;

    send(bs[from], { type: 'offerSwap', toSlot: to, giveTileId, takeTileId, word: 'КОРЮШКА' });
    await waitFor(bs[from], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap !== null);

    send(bs[from], { type: 'cancelSwap' });
    await waitFor(bs[from], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap === null);

    // Re-offer after cancelling must be accepted (pendingSwap was cleared, still our turn).
    send(bs[from], { type: 'offerSwap', toSlot: to, giveTileId, takeTileId, word: 'КОРЮШКА' });
    await waitFor(bs[from], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap !== null);

    const final = latestState(bs[from]).state;
    expect(final.pendingSwap).not.toBeNull();
    expect(final.pendingSwap!.fromSlot).toBe(from);
    await server.close();
  });

  it('offer then decline clears the offer with no score change', async () => {
    const { server, url } = await freshServer();
    const bs = [await buffered(url), await buffered(url), await buffered(url)] as const;
    join(bs[0], 0, 'A'); join(bs[1], 1, 'B'); join(bs[2], 2, 'C');
    await driveDraws(bs);
    await waitFor(bs[0], isStatePlaying());

    const st = latestState(bs[0]).state;
    const from = st.turnIndex;
    const to = ((from + 1) % 3) as Slot;
    send(bs[from], { type: 'offerSwap', toSlot: to,
      giveTileId: st.players[from]!.rack[0]!.id, takeTileId: st.players[to]!.rack[0]!.id, word: 'КОРЮШКА' });
    await waitFor(bs[to], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap !== null);

    send(bs[to], { type: 'respondSwap', accept: false });
    await waitFor(bs[from], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap === null && m.state.events.length >= 1);

    const final = latestState(bs[from]).state;
    expect(final.players[from]!.score).toBe(0);
    expect(final.players[to]!.score).toBe(0);
    await server.close();
  });
});

describe('M4b server: settings', () => {
  async function threeJoinedDrawing() {
    const ctx = await freshServer();
    const a = await buffered(ctx.url); join(a, 0, 'A');
    const b = await buffered(ctx.url); join(b, 1, 'B');
    const c = await buffered(ctx.url); join(c, 2, 'C');
    const bs = [a, b, c] as const;
    await Promise.all([
      waitFor(a, isStateWithPhase('drawing')),
      waitFor(b, isStateWithPhase('drawing')),
      waitFor(c, isStateWithPhase('drawing')),
    ]);
    return { ...ctx, a, b, c, bs };
  }

  const hasSettings = (swapMinWordLen: number, minWordLen: number) =>
    (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' &&
      m.state.settings.swapMinWordLen === swapMinWordLen &&
      m.state.settings.minWordLen === minWordLen;

  it('applies updateSettings during drawing, broadcasts it, then locks once playing', async () => {
    const { server, a, b, bs } = await threeJoinedDrawing();
    try {
      send(a, { type: 'updateSettings', settings: { swapMinWordLen: 5, minWordLen: 3 } });
      // The change reaches the other clients too.
      const seen = await waitFor(b, hasSettings(5, 3));
      expect(seen.state.settings).toEqual({ swapMinWordLen: 5, minWordLen: 3 });

      await driveDraws(bs);
      const playing = await waitFor(a, isStateWithPhase('playing'));
      expect(playing.state.settings).toEqual({ swapMinWordLen: 5, minWordLen: 3 });

      // Locked now — the engine rejects further edits.
      send(a, { type: 'updateSettings', settings: { swapMinWordLen: 8, minWordLen: 2 } });
      const err = await waitFor(a, isError);
      expect(err.message).toContain('до начала игры');
    } finally { await server.close(); }
  });
});
