# M3 — Place-and-Submit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-running scripted game with a real interactive lobby. Three browser tabs (`?slot=N&name=…`) connect to `/ws`, drag tiles from rack to board, click Submit, server validates via the M1 engine and broadcasts new snapshots. Single-spot placement only (no substitutions, no blanks usable, no swap/pass/redraw/endGame UI).

**Architecture:** Server gains a `connections` module that tracks per-slot WS + name, reads identity from the WS connection URL, seats players, and creates/loads the `Game`. The M1 engine is unchanged except for a new `Game.fromState` factory and an atomic save. Client wraps the existing M2 read-only renderer in `<DndContext>`, adds purely client-side `pendingPlacements`, and sends `submitMove` / handles `moveAccepted` / `moveRejected`.

**Tech Stack:** Existing M1+M2 stack plus `@dnd-kit/core` for drag-and-drop. No other new deps.

**Spec reference:** `docs/superpowers/specs/2026-05-01-m3-place-and-submit-design.md` (M3 design) + `docs/superpowers/specs/2026-04-30-scrabble-design.md` (game spec, source of truth).

**Scope of this plan:** M3 only. M4 (slot picker UI, multi-spot, substitutions, blanks, swap/pass/redraw/endGame UI, dictionary warnings, rack visibility) and M5 (history, polish, deploy) get their own plans.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `shared/types.ts` | Modify | Add `ClientMessage` and `ServerMessage` discriminated unions used by both ends. |
| `server/bag.ts` | Modify | Add `bagFromTiles(tiles, rng)` for reload from saved state. |
| `server/game.ts` | Modify | Add static `Game.fromState(state)` factory. |
| `server/persistence.ts` | Modify | Make `saveActiveGame` atomic (`.tmp` + rename). |
| `server/connections.ts` | Create | Seat tracking + seating logic + broadcast helper. |
| `server/index.ts` | Modify | Drop auto-script. Add lobby. Read slot/name from URL query. Dispatch messages. Boot-load. |
| `tests/bag.test.ts` | Modify | Tests for `bagFromTiles`. |
| `tests/game.test.ts` | Modify | Tests for `Game.fromState`. |
| `tests/persistence.test.ts` | Modify | Test atomic save behaviour. |
| `tests/connections.test.ts` | Create | Unit tests for seat tracking / seating. |
| `tests/integration/m2-server.test.ts` | Delete | The scripted auto-run no longer happens at server boot; `npm run demo` covers the runner. |
| `tests/integration/m3-server.test.ts` | Create | Seating, start-on-3, accepted move, rejected move, reconnect-by-name, slot conflict, stub-action errors, boot-load. |
| `package.json` | Modify | Add `@dnd-kit/core`. |
| `client/src/store.ts` | Modify | Add `mySlot`, `myName`, `pendingPlacements`, `lastError`, related setters. |
| `client/src/ws.ts` | Modify | Read identity from store; query string on `/ws`; handle `moveAccepted`, `moveRejected`, `error`. |
| `client/src/MissingParams.tsx` | Create | Shown when URL is missing/invalid `slot`/`name`. |
| `client/src/App.tsx` | Modify | Read URL params on mount; render `<MissingParams>` or main UI; wrap in `<DndContext>`. |
| `client/src/components/Tile.tsx` | Modify | Optionally `useDraggable` (depending on a new `draggable` prop). |
| `client/src/components/Square.tsx` | Modify | Optionally `useDroppable`. Render ghost tile from pending. |
| `client/src/components/Board.tsx` | Modify | Pass row/col/empty/pending info to `<Square>`. |
| `client/src/components/Rack.tsx` | Modify | Hide tiles in `pendingPlacements`. |
| `client/src/components/PlayerCard.tsx` | Modify | Submit / Recall All buttons when in-turn and pending non-empty. |
| `client/src/components/ErrorBanner.tsx` | Create | Inline banner under board for `lastError`. |
| `CLAUDE.md` | Modify | Note URL-param identity (M3 stub for §10). |

---

## Task 1: Shared WebSocket message types

Add discriminated unions for client→server and server→client messages so both ends share type-safe shapes. Keeps the protocol honest.

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add message types at the bottom of `shared/types.ts`**

```ts
// --- WebSocket protocol (M3 subset; M4 fills in the deferred actions) ---

export type ClientMessage =
  | { type: 'submitMove'; placements: Placement[] }
  | { type: 'swapTiles'; tileIds: string[] }
  | { type: 'claimBlank'; row: number; col: number; myTileId: string }
  | { type: 'pass' }
  | { type: 'redraw' }
  | { type: 'toggleRackVisible'; visible: boolean }
  | { type: 'endGame' };

export type ServerMessage =
  | { type: 'state'; state: GameState }
  | { type: 'moveAccepted'; moveRecord: MoveRecord; dictionaryWarnings: string[] }
  | { type: 'moveRejected'; reason: string }
  | { type: 'error'; message: string };
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS (nothing consumes the new types yet).

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(shared): add ClientMessage/ServerMessage WS protocol unions"
```

---

## Task 2: `bagFromTiles` helper for reload

Reload from `data/game.json` needs to reconstruct a `Bag` from a saved tile array without reshuffling.

**Files:**
- Modify: `server/bag.ts`
- Modify: `tests/bag.test.ts`

- [ ] **Step 1: Add a failing test in `tests/bag.test.ts`**

```ts
import { bagFromTiles } from '../server/bag';

describe('bagFromTiles', () => {
  it('preserves the given tile order without reshuffling', () => {
    const original = createBag(makeRng(1));
    const snapshot = original.tiles.map((t) => ({ ...t }));
    const restored = bagFromTiles(snapshot, makeRng(2));
    expect(restored.tiles).toEqual(snapshot);
  });

  it('shares no aliasing with the input array', () => {
    const original = createBag(makeRng(1));
    const restored = bagFromTiles(original.tiles, makeRng(2));
    drawTiles(restored, 1);
    expect(original.tiles.length).toBe(104);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npm test -- tests/bag.test.ts
```

Expected: FAIL — `bagFromTiles is not exported`.

- [ ] **Step 3: Add `bagFromTiles` to `server/bag.ts`**

Insert after `createBag`:

```ts
export function bagFromTiles(tiles: Tile[], rng: Rng): Bag {
  return { tiles: [...tiles], rng };
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm test -- tests/bag.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/bag.ts tests/bag.test.ts
git commit -m "feat(server): bagFromTiles helper for reload from saved state"
```

---

## Task 3: `Game.fromState` factory

Reconstruct a Game from a saved snapshot so the server can boot from `data/game.json`.

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Failing test in `tests/game.test.ts`**

Append a new `describe`:

```ts
describe('Game.fromState', () => {
  it('round-trips a fresh post-startGame snapshot', () => {
    const original = new Game({ seed: 1 });
    original.joinPlayer(0, 'A');
    original.joinPlayer(1, 'B');
    original.joinPlayer(2, 'C');
    original.startGame();
    const snap = original.snapshot();
    const restored = Game.fromState(snap);
    expect(restored.snapshot()).toEqual(snap);
  });

  it('lets a restored game keep playing', () => {
    const original = new Game({ seed: 1 });
    original.joinPlayer(0, 'A');
    original.joinPlayer(1, 'B');
    original.joinPlayer(2, 'C');
    original.startGame();
    const restored = Game.fromState(original.snapshot());
    // Force a rack we control so we can submit a known move.
    const racks = restored.snapshot().players.map((p) => p.rack);
    expect(racks[0]!.length).toBe(7);
    // We don't submit — we only check restored state continues to behave: turn 0 to play.
    expect(restored.snapshot().turnIndex).toBe(0);
    expect(restored.snapshot().phase).toBe('playing');
  });
});
```

- [ ] **Step 2: Run test, verify failure**

```bash
npm test -- tests/game.test.ts
```

Expected: FAIL — `Game.fromState is not a function`.

- [ ] **Step 3: Implement `Game.fromState`**

In `server/game.ts`:

1. Add import: `import { bagFromTiles, makeRng } from './bag.js';` (add `bagFromTiles` to the existing import line — `makeRng` is already imported).
2. Change the `state` and `bag` fields' modifiers so the factory can populate them. The simplest path: keep the existing constructor, but also add a private constructor overload via a static factory that bypasses `createBag`. Concretely, replace the class header and add the factory:

```ts
export class Game {
  private state: GameState;
  private bag: Bag;

  constructor(opts: GameOpts) {
    this.bag = createBag(makeRng(opts.seed));
    const players: [Player, Player, Player] = [0, 1, 2].map((slot) => ({
      slot: slot as Slot,
      name: '',
      connected: false,
      rack: [] as Tile[],
      rackVisible: true,
      score: 0,
    })) as [Player, Player, Player];
    this.state = {
      phase: 'waiting',
      players,
      turnIndex: 0,
      board: createEmptyBoard(),
      bag: this.bag.tiles,
      centerBonusUsed: false,
      history: [],
      startedAt: null,
    };
  }

  static fromState(state: GameState): Game {
    const g = Object.create(Game.prototype) as Game;
    // Deep-clone so the caller can keep mutating their snapshot independently.
    const cloned = structuredClone(state);
    g['bag'] = bagFromTiles(cloned.bag, makeRng(Date.now()));
    // Keep state.bag aliased to the bag's tile array so future draws update both.
    cloned.bag = g['bag'].tiles;
    g['state'] = cloned;
    return g;
  }

  // ... (rest of class unchanged)
}
```

Note: `Object.create(Game.prototype)` skips the constructor; we set the private fields via bracket access to satisfy TS strict.

- [ ] **Step 4: Run game tests, verify pass**

```bash
npm test -- tests/game.test.ts
```

Expected: PASS (all `Game` tests including the two new ones).

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "feat(server): Game.fromState factory for reload from snapshot"
```

---

## Task 4: Atomic `saveActiveGame`

Avoid corrupting `data/game.json` if the process dies mid-write.

**Files:**
- Modify: `server/persistence.ts`
- Modify: `tests/persistence.test.ts`

- [ ] **Step 1: Failing test**

Append to `tests/persistence.test.ts`:

```ts
import { readFileSync } from 'node:fs';

describe('saveActiveGame atomicity', () => {
  it('does not leave a .tmp file on success', () => {
    const state = sampleState();
    saveActiveGame(dataDir, state);
    expect(existsSync(path.join(dataDir, 'game.json'))).toBe(true);
    expect(existsSync(path.join(dataDir, 'game.json.tmp'))).toBe(false);
  });

  it('overwrites an existing file (rename semantics)', () => {
    const a = sampleState();
    saveActiveGame(dataDir, a);
    const b = sampleState();
    b.turnIndex = 2;
    saveActiveGame(dataDir, b);
    const reloaded = JSON.parse(readFileSync(path.join(dataDir, 'game.json'), 'utf-8'));
    expect(reloaded.turnIndex).toBe(2);
  });
});
```

- [ ] **Step 2: Run, verify expectations**

```bash
npm test -- tests/persistence.test.ts
```

Expected: the `.tmp` test will pass trivially with the current implementation (it never makes a tmp). The overwrite test should also pass already. We're hardening the implementation; tests guard the new contract.

- [ ] **Step 3: Make save atomic**

Edit `server/persistence.ts` `saveActiveGame`:

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, renameSync } from 'node:fs';

export function saveActiveGame(dataDir: string, state: GameState): void {
  mkdirSync(dataDir, { recursive: true });
  const final = path.join(dataDir, ACTIVE_FILE);
  const tmp = `${final}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), 'utf-8');
  renameSync(tmp, final);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/persistence.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/persistence.ts tests/persistence.test.ts
git commit -m "feat(server): atomic saveActiveGame via tmp+rename"
```

---

## Task 5: `server/connections.ts` — seat tracking module

A small pure module that owns per-slot `{ ws, name }`, applies seating rules, and helps broadcast. Keeps `server/index.ts` thin.

**Files:**
- Create: `server/connections.ts`
- Create: `tests/connections.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/connections.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSeats, seat, unseat, allSeated, namesInSlotOrder } from '../server/connections';

// Minimal stand-in for ws.WebSocket — we only check identity.
const fakeWs = (id: string) => ({ id }) as any;

describe('connections — seating', () => {
  it('starts with three empty seats', () => {
    const s = createSeats();
    expect(s[0]).toEqual({ ws: null, name: null });
    expect(s[1]).toEqual({ ws: null, name: null });
    expect(s[2]).toEqual({ ws: null, name: null });
    expect(allSeated(s)).toBe(false);
  });

  it('seats an empty slot', () => {
    const s = createSeats();
    const ws = fakeWs('a');
    const r = seat(s, 0, 'Alice', ws);
    expect(r).toEqual({ ok: true });
    expect(s[0]).toEqual({ ws, name: 'Alice' });
  });

  it('rejects a different name on a seat held by a live socket', () => {
    const s = createSeats();
    seat(s, 0, 'Alice', fakeWs('a'));
    const r = seat(s, 0, 'Bob', fakeWs('b'));
    expect(r).toEqual({ ok: false, reason: 'Slot taken' });
  });

  it('rejects same name when current socket is still live', () => {
    const s = createSeats();
    seat(s, 0, 'Alice', fakeWs('a'));
    const r = seat(s, 0, 'Alice', fakeWs('a2'));
    expect(r).toEqual({ ok: false, reason: 'Slot taken' });
  });

  it('allows reconnect by same name when previous socket is gone', () => {
    const s = createSeats();
    const wsA = fakeWs('a');
    seat(s, 0, 'Alice', wsA);
    unseat(s, wsA);
    expect(s[0]).toEqual({ ws: null, name: 'Alice' });
    const r = seat(s, 0, 'Alice', fakeWs('a2'));
    expect(r).toEqual({ ok: true });
    expect(s[0]!.name).toBe('Alice');
  });

  it('rejects different name on a previously-seated slot even after disconnect', () => {
    const s = createSeats();
    const wsA = fakeWs('a');
    seat(s, 0, 'Alice', wsA);
    unseat(s, wsA);
    const r = seat(s, 0, 'Bob', fakeWs('b'));
    expect(r).toEqual({ ok: false, reason: 'Slot taken' });
  });

  it('allSeated is true when all three slots have a name', () => {
    const s = createSeats();
    seat(s, 0, 'A', fakeWs('a'));
    seat(s, 1, 'B', fakeWs('b'));
    expect(allSeated(s)).toBe(false);
    seat(s, 2, 'C', fakeWs('c'));
    expect(allSeated(s)).toBe(true);
  });

  it('unseat by ws clears only the matching ws', () => {
    const s = createSeats();
    const wsA = fakeWs('a');
    const wsB = fakeWs('b');
    seat(s, 0, 'A', wsA);
    seat(s, 1, 'B', wsB);
    unseat(s, wsA);
    expect(s[0]!.ws).toBeNull();
    expect(s[1]!.ws).toBe(wsB);
  });

  it('namesInSlotOrder returns names in slot order', () => {
    const s = createSeats();
    seat(s, 0, 'A', fakeWs('a'));
    seat(s, 1, 'B', fakeWs('b'));
    seat(s, 2, 'C', fakeWs('c'));
    expect(namesInSlotOrder(s)).toEqual(['A', 'B', 'C']);
  });
});
```

- [ ] **Step 2: Run, verify failure (module missing)**

```bash
npm test -- tests/connections.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/connections.ts`**

```ts
import type { WebSocket } from 'ws';
import type { Slot } from '@shared/types';

export type Seat = {
  ws: WebSocket | null;
  name: string | null;
};

export type Seats = [Seat, Seat, Seat];

export type SeatResult = { ok: true } | { ok: false; reason: string };

export function createSeats(): Seats {
  return [
    { ws: null, name: null },
    { ws: null, name: null },
    { ws: null, name: null },
  ];
}

export function seat(seats: Seats, slot: Slot, name: string, ws: WebSocket): SeatResult {
  const seat = seats[slot]!;
  if (seat.name !== null && seat.name !== name) {
    return { ok: false, reason: 'Slot taken' };
  }
  if (seat.name === name && seat.ws !== null) {
    return { ok: false, reason: 'Slot taken' };
  }
  seat.name = name;
  seat.ws = ws;
  return { ok: true };
}

export function unseat(seats: Seats, ws: WebSocket): Slot | null {
  for (let i = 0; i < seats.length; i++) {
    if (seats[i]!.ws === ws) {
      seats[i]!.ws = null;
      return i as Slot;
    }
  }
  return null;
}

export function allSeated(seats: Seats): boolean {
  return seats.every((s) => s.name !== null);
}

export function namesInSlotOrder(seats: Seats): [string, string, string] {
  return [seats[0]!.name!, seats[1]!.name!, seats[2]!.name!];
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- tests/connections.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/connections.ts tests/connections.test.ts
git commit -m "feat(server): connections module — seat tracking with reconnect-by-name"
```

---

## Task 6: Rewrite `server/index.ts` — lobby, seating, dispatch (no submit yet)

Drop the auto-script. Read `slot` and `name` from the WS connection URL. Seat players. Create the Game once all three are seated. Broadcast snapshots on join/leave. Stub out `submitMove` and other actions for now (Task 7 fills `submitMove`).

**Files:**
- Modify: `server/index.ts`
- Delete: `tests/integration/m2-server.test.ts` (moved to demo + new M3 test)

- [ ] **Step 1: Delete the obsolete M2 integration test**

```bash
git rm tests/integration/m2-server.test.ts
```

- [ ] **Step 2: Rewrite `server/index.ts`**

Replace the entire file with:

```ts
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ClientMessage, ServerMessage, GameState, Slot } from '@shared/types';
import { Game } from './game.js';
import { createSeats, seat, unseat, allSeated, namesInSlotOrder, type Seats } from './connections.js';
import { saveActiveGame, loadActiveGame } from './persistence.js';

export type ServerOptions = {
  port?: number;
  serveStatic?: boolean;
  dataDir?: string;
};

export type RunningServer = {
  httpServer: HttpServer;
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
};

const VALID_SLOTS = new Set(['0', '1', '2']);

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const port = opts.port ?? Number(process.env.PORT ?? 3000);
  const serveStatic = opts.serveStatic ?? process.env.NODE_ENV === 'production';
  const dataDir = opts.dataDir ?? path.resolve(process.cwd(), 'data');

  const app = express();
  if (serveStatic) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = path.resolve(__dirname, '../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const seats: Seats = createSeats();
  let game: Game | null = null;

  // Boot-load if a saved active game exists.
  const loaded = loadActiveGame(dataDir);
  if (loaded !== null) {
    game = Game.fromState(loaded);
  }

  function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function broadcastState(): void {
    if (game === null) return;
    const state = game.snapshot();
    syncConnectedFromSeats(state, seats);
    const payload: ServerMessage = { type: 'state', state };
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  function lobbySnapshot(): GameState {
    // Synthetic empty state for the pre-game lobby. Phase = 'waiting',
    // names reflect whoever has seated.
    return {
      phase: 'waiting',
      players: [0, 1, 2].map((i) => ({
        slot: i as Slot,
        name: seats[i]!.name ?? '',
        connected: seats[i]!.ws !== null,
        rack: [],
        rackVisible: true,
        score: 0,
      })) as GameState['players'],
      turnIndex: 0,
      board: Array.from({ length: 15 }, () => Array<null>(15).fill(null)),
      bag: [],
      centerBonusUsed: false,
      history: [],
      startedAt: null,
    };
  }

  function sendStateTo(ws: WebSocket): void {
    const state = game !== null ? game.snapshot() : lobbySnapshot();
    syncConnectedFromSeats(state, seats);
    send(ws, { type: 'state', state });
  }

  function handleSubmitMove(slot: Slot, msg: Extract<ClientMessage, { type: 'submitMove' }>, ws: WebSocket): void {
    if (game === null) {
      send(ws, { type: 'error', message: 'Game not started' });
      return;
    }
    const result = game.submitMove(slot, msg.placements);
    if (!result.ok) {
      send(ws, { type: 'moveRejected', reason: humanReadableReason(result.error) });
      return;
    }
    try {
      saveActiveGame(dataDir, game.snapshot());
    } catch (err) {
      console.error('[scrabble] saveActiveGame failed:', err);
    }
    broadcastState();
    send(ws, { type: 'moveAccepted', moveRecord: result.moveRecord, dictionaryWarnings: result.dictionaryWarnings });
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/ws', 'ws://localhost');
    const slotStr = url.searchParams.get('slot');
    const name = url.searchParams.get('name')?.trim();
    if (slotStr === null || !VALID_SLOTS.has(slotStr) || !name) {
      ws.close(1008, 'Bad join params');
      return;
    }
    const slot = Number(slotStr) as Slot;

    // If a Game exists, the URL name must match the saved seat name in that slot
    // (if there's a saved name). The seats map enforces this for in-memory state;
    // we additionally cross-check against the persisted player name when applicable.
    if (game !== null) {
      const persistedName = game.snapshot().players[slot]!.name;
      if (persistedName !== '' && persistedName !== name) {
        send(ws, { type: 'error', message: 'Slot taken' });
        ws.close(1008, 'Slot taken');
        return;
      }
    }

    const result = seat(seats, slot, name, ws);
    if (!result.ok) {
      send(ws, { type: 'error', message: result.reason });
      ws.close(1008, result.reason);
      return;
    }

    // If a Game exists, mark this seat connected. If we just filled the third seat
    // and no Game exists, create the Game now.
    if (game !== null) {
      game.joinPlayer(slot, name);
    } else if (allSeated(seats)) {
      game = new Game({ seed: Date.now() });
      const names = namesInSlotOrder(seats);
      game.joinPlayer(0, names[0]);
      game.joinPlayer(1, names[1]);
      game.joinPlayer(2, names[2]);
      game.startGame();
      try {
        saveActiveGame(dataDir, game.snapshot());
      } catch (err) {
        console.error('[scrabble] saveActiveGame failed:', err);
      }
    }

    // Send fresh state to the new client and broadcast updated state to everyone
    // (so others see the new connected flag / new game).
    if (game !== null) {
      broadcastState();
    } else {
      // Lobby update: send the lobby snapshot to all sockets.
      const data = JSON.stringify({ type: 'state', state: lobbySnapshot() } as ServerMessage);
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(data);
      }
    }

    ws.on('message', (raw: RawData) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }
      switch (msg.type) {
        case 'submitMove':
          handleSubmitMove(slot, msg, ws);
          return;
        case 'swapTiles':
        case 'claimBlank':
        case 'pass':
        case 'redraw':
        case 'toggleRackVisible':
        case 'endGame':
          send(ws, { type: 'error', message: 'not yet implemented' });
          return;
        default:
          send(ws, { type: 'error', message: 'Unknown message type' });
      }
    });

    ws.on('close', () => {
      const which = unseat(seats, ws);
      if (which === null) return;
      // If a Game exists, mark the player disconnected so others see it.
      if (game !== null) {
        const snap = game.snapshot();
        snap.players[which]!.connected = false;
        // We don't have a public "disconnect" on Game; just rebroadcast lobby-or-state.
        broadcastState();
      } else {
        const data = JSON.stringify({ type: 'state', state: lobbySnapshot() } as ServerMessage);
        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) client.send(data);
        }
      }
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const actualPort = (httpServer.address() as AddressInfo).port;

  const close = async (): Promise<void> => {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { httpServer, wss, port: actualPort, close };
}

function syncConnectedFromSeats(state: GameState, seats: Seats): void {
  for (let i = 0; i < 3; i++) {
    state.players[i]!.connected = seats[i]!.ws !== null;
  }
}

function humanReadableReason(error: { kind: string }): string {
  switch (error.kind) {
    case 'not-your-turn': return 'Сейчас не ваш ход';
    case 'not-playing': return 'Игра не в процессе';
    case 'off_grid': return 'Плитка вне поля';
    case 'overlap': return 'Клетка уже занята';
    case 'disconnected': return 'Слова должны соединяться с уже сыгранными';
    case 'gap': return 'В слове есть пропуск';
    case 'first_move_off_center': return 'Первый ход должен закрывать центральную клетку';
    case 'not_in_line': return 'Плитки должны быть в одной линии';
    case 'tile_not_in_rack': return 'Плитки нет на стойке';
    case 'duplicate_tile': return 'Дублирующаяся плитка';
    case 'invalid_substitution': return 'Недопустимая замена буквы';
    case 'word_too_short': return 'Слишком короткое слово';
    default: return `Ошибка: ${error.kind}`;
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer()
    .then((server) => {
      console.log(`[scrabble] listening on http://localhost:${server.port} (ws: /ws)`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

Note: cross-check the `MoveError.kind` strings against `server/moves.ts` before committing. If any kind is missing or named differently, fix it in `humanReadableReason`.

- [ ] **Step 3: Verify `MoveError` kinds**

```bash
grep -n "kind:" server/moves.ts
```

Update `humanReadableReason` so every kind appears (default branch is the safety net).

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run unit tests (skip integration for now)**

```bash
npm test
```

Expected: existing unit tests pass; the M2 integration test is gone; M3 integration test doesn't exist yet.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(server): replace auto-script with lobby + URL-param seating

Drops the M2 scripted-runner boot path. /ws now reads slot+name from
the connection URL, seats players in connections.ts, creates the
Game once all three are seated, and dispatches submitMove (other
client actions stub to 'not yet implemented'). Also boot-loads from
data/game.json if present. M2 integration test deleted; M3 coverage
lands in the next task."
```

---

## Task 7: M3 integration test — happy path + rejections

Real WS exercise of seating + game start + submitMove + rejection paths.

**Files:**
- Create: `tests/integration/m3-server.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GameState, ServerMessage } from '@shared/types';
import { startServer } from '../../server/index.js';

function openWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage<T extends ServerMessage['type']>(ws: WebSocket, type: T): Promise<Extract<ServerMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const onMsg = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.type === type) {
        ws.off('message', onMsg);
        resolve(msg as Extract<ServerMessage, { type: T }>);
      }
    };
    ws.on('message', onMsg);
    ws.once('error', reject);
  });
}

async function freshServer() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-m3-'));
  const server = await startServer({ port: 0, serveStatic: false, dataDir });
  const url = (slot: number, name: string) => `ws://localhost:${server.port}/ws?slot=${slot}&name=${encodeURIComponent(name)}`;
  return { server, url, dataDir };
}

describe('M3 server: seating and submitMove', () => {
  it('starts the game when all three slots seated, advances on submitMove', async () => {
    const { server, url } = await freshServer();
    try {
      const w0 = await openWs(url(0, 'A'));
      const s0a = await nextMessage(w0, 'state');
      expect(s0a.state.phase).toBe('waiting');

      const w1 = await openWs(url(1, 'B'));
      const w2 = await openWs(url(2, 'C'));

      // After w2 connects, all three should receive a phase=playing snapshot.
      const playing0 = await nextMessage(w0, 'state');
      // Drain until phase=playing — earlier states for w0 may be older waiting frames.
      const playingState = await waitForPhase(w0, 'playing', playing0.state);
      expect(playingState.players.map((p) => p.name)).toEqual(['A', 'B', 'C']);
      expect(playingState.players.every((p) => p.rack.length === 7)).toBe(true);

      // Slot 0's first move: place a tile from the rack on (7,7).
      const myRack = playingState.players[0]!.rack;
      const tile = myRack[0]!;
      const submission = {
        type: 'submitMove' as const,
        placements: [{ tileId: tile.id, row: 7, col: 7, playedAs: tile.letter }],
      };
      // A single-tile first move is invalid (word_too_short) — confirm the rejection path.
      const rejectedP = nextMessage(w0, 'moveRejected');
      w0.send(JSON.stringify(submission));
      const rejected = await rejectedP;
      expect(rejected.reason).toMatch(/Слишком|Ошибка|first_move|Плитка/);

      w0.close(); w1.close(); w2.close();
    } finally {
      await server.close();
    }
  });

  it('rejects submitMove from out-of-turn player', async () => {
    const { server, url } = await freshServer();
    try {
      const [w0, w1, w2] = await Promise.all([
        openWs(url(0, 'A')),
        openWs(url(1, 'B')),
        openWs(url(2, 'C')),
      ]);
      // Wait for the playing snapshot on w1.
      await waitForPhaseWs(w1, 'playing');

      const rejectedP = nextMessage(w1, 'moveRejected');
      w1.send(JSON.stringify({ type: 'submitMove', placements: [] }));
      const rejected = await rejectedP;
      expect(rejected.reason).toBe('Сейчас не ваш ход');

      w0.close(); w1.close(); w2.close();
    } finally {
      await server.close();
    }
  });

  it('replies "not yet implemented" for stubbed actions', async () => {
    const { server, url } = await freshServer();
    try {
      const [w0, w1, w2] = await Promise.all([
        openWs(url(0, 'A')),
        openWs(url(1, 'B')),
        openWs(url(2, 'C')),
      ]);
      await waitForPhaseWs(w0, 'playing');
      const errP = nextMessage(w0, 'error');
      w0.send(JSON.stringify({ type: 'pass' }));
      const err = await errP;
      expect(err.message).toBe('not yet implemented');
      w0.close(); w1.close(); w2.close();
    } finally {
      await server.close();
    }
  });

  it('rejects connection with mismatched slot/name and slot conflict', async () => {
    const { server, url } = await freshServer();
    try {
      const w0 = await openWs(url(0, 'A'));
      // Different name on the same slot while live — should error and close.
      const wsBad = new WebSocket(url(0, 'B'));
      const closeReason = await new Promise<string>((resolve) => {
        wsBad.on('close', (_code, reason) => resolve(reason.toString()));
      });
      expect(closeReason).toBe('Slot taken');
      w0.close();
    } finally {
      await server.close();
    }
  });

  it('allows reconnect with same name after disconnect', async () => {
    const { server, url } = await freshServer();
    try {
      const w0 = await openWs(url(0, 'A'));
      const w1 = await openWs(url(1, 'B'));
      const w2 = await openWs(url(2, 'C'));
      await waitForPhaseWs(w0, 'playing');

      // Slot 1 disconnects.
      await new Promise<void>((resolve) => { w1.on('close', () => resolve()); w1.close(); });
      // Reconnect as same name.
      const w1b = await openWs(url(1, 'B'));
      const snap = await nextMessage(w1b, 'state');
      expect(snap.state.phase).toBe('playing');
      expect(snap.state.players[1]!.name).toBe('B');

      w0.close(); w1b.close(); w2.close();
    } finally {
      await server.close();
    }
  });
});

async function waitForPhase(ws: WebSocket, phase: GameState['phase'], maybeFirst?: GameState): Promise<GameState> {
  if (maybeFirst && maybeFirst.phase === phase) return maybeFirst;
  return new Promise((resolve) => {
    const onMsg = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.type === 'state' && msg.state.phase === phase) {
        ws.off('message', onMsg);
        resolve(msg.state);
      }
    };
    ws.on('message', onMsg);
  });
}

async function waitForPhaseWs(ws: WebSocket, phase: GameState['phase']): Promise<GameState> {
  return waitForPhase(ws, phase);
}
```

- [ ] **Step 2: Run integration tests**

```bash
npm test -- tests/integration/m3-server.test.ts
```

Expected: PASS. If any test fails, prefer fixing the implementation in `server/index.ts` over loosening the test — the test encodes the contract.

- [ ] **Step 3: Run full suite**

```bash
npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/m3-server.test.ts
git commit -m "test(server): M3 integration coverage — seating, submitMove, reconnect"
```

---

## Task 8: Add `@dnd-kit/core` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install @dnd-kit/core
```

- [ ] **Step 2: Verify it's in `dependencies`**

```bash
grep -A2 '"dependencies"' package.json | grep dnd-kit
```

Expected: `"@dnd-kit/core": "^6.x.y"`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @dnd-kit/core for M3 drag-and-drop"
```

---

## Task 9: Client identity from URL + `MissingParams` page

**Files:**
- Create: `client/src/MissingParams.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/store.ts`

- [ ] **Step 1: Add identity fields to the store**

Edit `client/src/store.ts`:

```ts
import { create } from 'zustand';
import type { GameState, Slot } from '@shared/types';

type Pending = { tileId: string; row: number; col: number };

type Store = {
  state: GameState | null;
  connected: boolean;
  mySlot: Slot | null;
  myName: string | null;
  pendingPlacements: Pending[];
  lastError: string | null;
  setState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
  setIdentity: (slot: Slot, name: string) => void;
  addPending: (p: Pending) => void;
  removePending: (tileId: string) => void;
  clearPending: () => void;
  setError: (message: string | null) => void;
};

export const useStore = create<Store>((set) => ({
  state: null,
  connected: false,
  mySlot: null,
  myName: null,
  pendingPlacements: [],
  lastError: null,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
  setIdentity: (mySlot, myName) => set({ mySlot, myName }),
  addPending: (p) =>
    set((s) => ({ pendingPlacements: [...s.pendingPlacements, p], lastError: null })),
  removePending: (tileId) =>
    set((s) => ({
      pendingPlacements: s.pendingPlacements.filter((x) => x.tileId !== tileId),
      lastError: null,
    })),
  clearPending: () => set({ pendingPlacements: [], lastError: null }),
  setError: (lastError) => set({ lastError }),
}));
```

- [ ] **Step 2: Create `client/src/MissingParams.tsx`**

```tsx
export function MissingParams() {
  const here = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const link = (slot: number, name: string) => `${here}?slot=${slot}&name=${encodeURIComponent(name)}`;
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '40px auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Корюшка пошла</h1>
      <p>Откройте эту страницу с параметрами <code>?slot=N&amp;name=Имя</code>, где <code>N</code> — 0, 1 или 2.</p>
      <ul style={{ marginTop: 16 }}>
        <li><a href={link(0, 'Игрок1')}>{link(0, 'Игрок1')}</a></li>
        <li><a href={link(1, 'Игрок2')}>{link(1, 'Игрок2')}</a></li>
        <li><a href={link(2, 'Игрок3')}>{link(2, 'Игрок3')}</a></li>
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Wire URL parsing in `client/src/App.tsx`**

Read params on mount; render `<MissingParams>` if invalid; otherwise set identity and render the existing layout (DndContext is added in Task 11):

```tsx
import { useEffect, useState } from 'react';
import type { Slot } from '@shared/types';
import { useStore } from './store';
import { connectWs } from './ws';
import { Board } from './components/Board';
import { PlayerCard } from './components/PlayerCard';
import { MissingParams } from './MissingParams';

const VALID = new Set(['0', '1', '2']);

export default function App() {
  const setIdentity = useStore((s) => s.setIdentity);
  const [ready, setReady] = useState(false);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slotStr = params.get('slot');
    const name = params.get('name')?.trim();
    if (slotStr === null || !VALID.has(slotStr) || !name) {
      setBad(true);
      return;
    }
    const slot = Number(slotStr) as Slot;
    setIdentity(slot, name);
    connectWs(slot, name);
    setReady(true);
  }, [setIdentity]);

  if (bad) return <MissingParams />;
  if (!ready) return null;

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      <main className="mx-auto max-w-6xl p-6 flex gap-6">
        <Board />
        <aside className="flex flex-col gap-4">
          <PlayerCard slot={0} />
          <PlayerCard slot={1} />
          <PlayerCard slot={2} />
        </aside>
      </main>
    </div>
  );
}
```

(If the M2 layout differs from the snippet above, preserve M2's exact structure — only add the URL-param + MissingParams logic. Read the current `App.tsx` first.)

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: PASS (note: `connectWs` signature changes in Task 10; if it errors here, do Task 10 in the same commit and adjust).

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/MissingParams.tsx client/src/store.ts
git commit -m "feat(client): URL-param identity (slot + name) and MissingParams page"
```

---

## Task 10: Update `client/src/ws.ts` — query string + new message types

**Files:**
- Modify: `client/src/ws.ts`

- [ ] **Step 1: Rewrite `connectWs` to take `(slot, name)` and pass them as query params**

```ts
import type { ServerMessage, Slot } from '@shared/types';
import { useStore } from './store';

let socket: WebSocket | null = null;

export function connectWs(slot: Slot, name: string): void {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}/ws?slot=${slot}&name=${encodeURIComponent(name)}`;
  open(url);
}

function open(url: string): void {
  socket = new WebSocket(url);
  const store = useStore.getState();
  socket.addEventListener('open', () => store.setConnected(true));
  socket.addEventListener('close', () => {
    store.setConnected(false);
    setTimeout(() => open(url), 1000);
  });
  socket.addEventListener('message', (ev) => {
    let msg: ServerMessage;
    try { msg = JSON.parse(ev.data) as ServerMessage; } catch { return; }
    switch (msg.type) {
      case 'state':
        store.setState(msg.state);
        // Clean any pending placements that reference tiles no longer in my rack.
        cleanPending();
        return;
      case 'moveAccepted':
        store.clearPending();
        return;
      case 'moveRejected':
        store.setError(msg.reason);
        return;
      case 'error':
        store.setError(msg.message);
        return;
    }
  });
}

function cleanPending(): void {
  const s = useStore.getState();
  if (s.state === null || s.mySlot === null) return;
  const myRackIds = new Set(s.state.players[s.mySlot]!.rack.map((t) => t.id));
  for (const p of s.pendingPlacements) {
    if (!myRackIds.has(p.tileId)) s.removePending(p.tileId);
  }
}

export function send(msg: { type: string; [k: string]: unknown }): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/ws.ts
git commit -m "feat(client): WS connect with slot+name query, handle moveAccepted/Rejected/error"
```

---

## Task 11: `<DndContext>` + draggable rack tiles

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Tile.tsx`

- [ ] **Step 1: Wrap App in `<DndContext>` with onDragEnd dispatch**

In `App.tsx`, import and wrap the layout:

```tsx
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
// ...

export default function App() {
  // ... existing identity logic
  const addPending = useStore((s) => s.addPending);

  function onDragEnd(ev: DragEndEvent) {
    if (ev.over === null) return;
    const tileId = String(ev.active.id);
    // Drop targets are board squares with id "sq-{row}-{col}".
    const m = /^sq-(\d+)-(\d+)$/.exec(String(ev.over.id));
    if (!m) return;
    addPending({ tileId, row: Number(m[1]), col: Number(m[2]) });
  }

  if (bad) return <MissingParams />;
  if (!ready) return null;

  return (
    <DndContext onDragEnd={onDragEnd}>
      <div className="min-h-screen bg-neutral-900 text-neutral-100">
        <main className="mx-auto max-w-6xl p-6 flex gap-6">
          <Board />
          <aside className="flex flex-col gap-4">
            <PlayerCard slot={0} />
            <PlayerCard slot={1} />
            <PlayerCard slot={2} />
          </aside>
        </main>
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 2: Make rack tiles draggable**

Read the current `client/src/components/Tile.tsx`. Add an optional `draggable?: boolean` prop. When `draggable === true`, use `useDraggable({ id: tile.id })` and spread its listeners/attributes onto the root element. When false, render as before.

```tsx
import { useDraggable } from '@dnd-kit/core';
import type { Tile as TileT } from '@shared/types';

type Props = {
  tile: TileT;
  draggable?: boolean;
  ghost?: boolean; // greyed-out / orange-ringed pending state
};

export function Tile({ tile, draggable = false, ghost = false }: Props) {
  if (draggable) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: tile.id });
    const style: React.CSSProperties = {
      transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      opacity: isDragging ? 0.4 : 1,
    };
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={tileClass(ghost)}>
        {renderInner(tile)}
      </div>
    );
  }
  return <div className={tileClass(ghost)}>{renderInner(tile)}</div>;
}

function tileClass(ghost: boolean): string {
  return [
    'select-none cursor-grab active:cursor-grabbing flex items-center justify-center',
    'w-12 h-12 rounded-md bg-amber-200 text-neutral-900 font-bold text-xl shadow',
    ghost ? 'ring-2 ring-orange-400 opacity-60' : '',
  ].filter(Boolean).join(' ');
}

function renderInner(tile: TileT) {
  return (
    <>
      <span>{tile.isBlank ? '★' : tile.letter}</span>
      <span className="absolute bottom-0.5 right-1 text-[10px]">{tile.points}</span>
    </>
  );
}
```

(Match M2's existing class names / palette where possible — only the `useDraggable` integration and the `draggable`/`ghost` props are new behaviour. Preserve existing star-glyph for blanks.)

- [ ] **Step 3: Toggle `draggable` from `<Rack>`**

Modify `client/src/components/Rack.tsx` so that for the *current player's own rack*, tiles get `draggable={true}` when:
- `state.turnIndex === mySlot`, AND
- `tile.isBlank === false`, AND
- the tile is not in `pendingPlacements`.

Tiles already in `pendingPlacements` are filtered out of the rack render.

```tsx
import { useStore } from '../store';
import type { Slot, Tile as TileT } from '@shared/types';
import { Tile } from './Tile';

export function Rack({ slot, rack }: { slot: Slot; rack: TileT[] }) {
  const mySlot = useStore((s) => s.mySlot);
  const turnIndex = useStore((s) => s.state?.turnIndex);
  const pending = useStore((s) => s.pendingPlacements);
  const pendingIds = new Set(pending.map((p) => p.tileId));
  const isMine = mySlot === slot;
  const myTurn = turnIndex === slot;

  const visible = rack.filter((t) => !pendingIds.has(t.id));
  return (
    <div className="flex gap-1">
      {visible.map((tile) => (
        <Tile
          key={tile.id}
          tile={tile}
          draggable={isMine && myTurn && !tile.isBlank}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and run dev server**

```bash
npm run typecheck
npm run dev
```

Open three tabs at `?slot=0&name=A`, `?slot=1&name=B`, `?slot=2&name=C`. Confirm the game starts, slot 0's tiles can be picked up (cursor change, opacity change) but not dropped anywhere yet (no droppables).

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/components/Tile.tsx client/src/components/Rack.tsx
git commit -m "feat(client): DndContext + draggable rack tiles for the in-turn player"
```

---

## Task 12: Droppable squares + ghost tile rendering

**Files:**
- Modify: `client/src/components/Square.tsx`
- Modify: `client/src/components/Board.tsx`

- [ ] **Step 1: Make empty squares droppable, render ghost when pending**

`Square.tsx`:

```tsx
import { useDroppable } from '@dnd-kit/core';
import type { Cell, Slot, Tile as TileT } from '@shared/types';
import { Tile } from './Tile';
import { useStore } from '../store';

type Props = {
  row: number;
  col: number;
  cell: Cell | null;
  premium: ReturnType<typeof premiumLabel>; // existing helper from M2 — keep current type
};

export function Square({ row, col, cell, premium }: Props) {
  const mySlot = useStore((s) => s.mySlot);
  const state = useStore((s) => s.state);
  const pending = useStore((s) => s.pendingPlacements);
  const removePending = useStore((s) => s.removePending);

  const pendingHere = pending.find((p) => p.row === row && p.col === col) ?? null;
  const isMyTurn = state !== null && mySlot !== null && state.turnIndex === mySlot;
  const droppable = cell === null && pendingHere === null && isMyTurn;

  const { setNodeRef, isOver } = useDroppable({ id: `sq-${row}-${col}`, disabled: !droppable });

  let content: React.ReactNode = null;
  if (cell !== null) {
    content = <Tile tile={cell.tile} />;
  } else if (pendingHere !== null && state !== null && mySlot !== null) {
    const myTile = state.players[mySlot]!.rack.find((t) => t.id === pendingHere.tileId);
    if (myTile) {
      content = (
        <button onClick={() => removePending(pendingHere.tileId)} className="contents">
          <Tile tile={myTile} ghost />
        </button>
      );
    }
  } else {
    content = renderPremium(premium);
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        'w-13 h-13 border border-neutral-700 flex items-center justify-center relative',
        squareBgClass(premium, row, col),
        isOver ? 'ring-2 ring-emerald-400' : '',
      ].join(' ')}
    >
      {content}
    </div>
  );
}

// `premiumLabel`, `renderPremium`, and `squareBgClass` are existing helpers/constants
// from the M2 implementation — keep their current signatures and inline behaviour.
```

(If the existing M2 `Square.tsx` uses different helper names, keep them; only the `useDroppable`, `pendingHere`, and click-to-recall behaviour are new.)

- [ ] **Step 2: Pass row/col/cell from `<Board>` to `<Square>`**

If `Board.tsx` already passes `(row, col, cell, premium)`, no change is needed. Otherwise:

```tsx
import { useStore } from '../store';
import { Square } from './Square';
import { PREMIUMS } from '@shared/premiums';

const SIZE = 15;

export function Board() {
  const board = useStore((s) => s.state?.board);
  if (!board) return null;
  return (
    <div className="grid grid-cols-15 gap-px bg-neutral-700 p-px">
      {Array.from({ length: SIZE }).map((_, r) =>
        Array.from({ length: SIZE }).map((__, c) => (
          <Square key={`${r}-${c}`} row={r} col={c} cell={board[r]![c]} premium={PREMIUMS[r]![c]} />
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + manual smoke**

```bash
npm run typecheck
npm run dev
```

In three tabs, slot 0 should be able to drag a rack tile onto an empty square. The tile should appear as a ghost on the board, and the rack should hide it. Clicking the ghost tile returns it to the rack.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Square.tsx client/src/components/Board.tsx
git commit -m "feat(client): droppable board squares with ghost-tile pending state + click-to-recall"
```

---

## Task 13: Submit / Recall All buttons in `<PlayerCard>`

**Files:**
- Modify: `client/src/components/PlayerCard.tsx`

- [ ] **Step 1: Add buttons that show only for in-turn me with pending placements**

```tsx
import type { Slot } from '@shared/types';
import { useStore } from '../store';
import { Rack } from './Rack';
import { send } from '../ws';

export function PlayerCard({ slot }: { slot: Slot }) {
  const state = useStore((s) => s.state);
  const mySlot = useStore((s) => s.mySlot);
  const pending = useStore((s) => s.pendingPlacements);
  const clearPending = useStore((s) => s.clearPending);
  if (!state) return null;
  const player = state.players[slot]!;
  const isMine = slot === mySlot;
  const isMyTurn = state.turnIndex === slot;
  const showButtons = isMine && isMyTurn && pending.length > 0;

  function onSubmit() {
    if (state === null || mySlot === null) return;
    const myRack = state.players[mySlot]!.rack;
    const placements = pending
      .map((p) => {
        const tile = myRack.find((t) => t.id === p.tileId);
        if (!tile) return null;
        return { tileId: p.tileId, row: p.row, col: p.col, playedAs: tile.letter };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    send({ type: 'submitMove', placements });
  }

  return (
    <div className={[
      'rounded-lg p-3 bg-neutral-800',
      isMyTurn ? 'ring-2 ring-emerald-400' : '',
    ].join(' ')}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">{player.name || `Slot ${slot}`}</span>
        <span className="text-xl tabular-nums">{player.score}</span>
      </div>
      {isMine ? <Rack slot={slot} rack={player.rack} /> : (
        <div className="text-sm text-neutral-400">{player.rack.length} плиток</div>
      )}
      {showButtons && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onSubmit}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded font-medium"
          >Сходить</button>
          <button
            onClick={clearPending}
            className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded"
          >Вернуть</button>
        </div>
      )}
    </div>
  );
}
```

(Adapt to match M2's existing card structure — keep its layout and class names, only add the buttons block.)

- [ ] **Step 2: Manual smoke**

```bash
npm run dev
```

Three tabs. Slot 0 drags a few tiles onto valid first-move positions crossing center. Clicks Сходить. Server validates; if accepted, board updates everywhere, turn advances; if rejected, banner appears (Task 14).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PlayerCard.tsx
git commit -m "feat(client): Submit / Recall All buttons; submit sends submitMove"
```

---

## Task 14: `ErrorBanner` component

**Files:**
- Create: `client/src/components/ErrorBanner.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useStore } from '../store';

export function ErrorBanner() {
  const lastError = useStore((s) => s.lastError);
  if (lastError === null) return null;
  return (
    <div className="mt-3 px-4 py-2 rounded bg-rose-900/60 border border-rose-700 text-rose-100">
      {lastError}
    </div>
  );
}
```

- [ ] **Step 2: Place under `<Board>` in `App.tsx`**

```tsx
<div>
  <Board />
  <ErrorBanner />
</div>
```

- [ ] **Step 3: Manual smoke**

Trigger a rejected move (e.g., place tiles off-center on the first move): banner appears in red. Then drag/recall → banner disappears (cleared by `addPending`/`removePending`/`clearPending`).

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/components/ErrorBanner.tsx
git commit -m "feat(client): ErrorBanner shows server moveRejected/error reasons"
```

---

## Task 15: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add an M3 note in the project status / build sections**

Edit `CLAUDE.md`:

- Update the status line (`M1 (server engine) complete. M2 = HTTP/WS, M3+ = UI.`) to: `M1+M2+M3 complete. M4 = remaining rules + lobby UI, M5 = polish/deploy.`
- Add to the "Build & Development" section, after the existing `npm run dev` description:

```
The server now expects each browser tab to provide identity via the URL:
`http://localhost:5173/?slot=0&name=Игрок1` (slots 0–2). The slot picker UI
arrives in M4. While running, `data/game.json` persists the active game and
will be reloaded on next boot.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: M3 status + URL-param identity instructions"
```

---

## Task 16: Final smoke checklist

Manual end-to-end run, no automation. Use the demo seed if you want predictable racks (`seed: 1`); otherwise just play.

- [ ] **Run:** `npm run typecheck && npm test` — must be green.
- [ ] **Run:** `npm run dev` — open three Chrome tabs at:
  - `http://localhost:5173/?slot=0&name=A`
  - `http://localhost:5173/?slot=1&name=B`
  - `http://localhost:5173/?slot=2&name=C`
- [ ] Confirm: third tab triggers `phase=playing`; all three see the same starting state with 7-tile racks.
- [ ] Slot 0 plays a valid first move (≥2 tiles crossing centre). Confirm Сходить sends, server accepts, all three tabs update, turn moves to slot 1, slot 0's `ring-emerald-400` highlight moves to slot 1.
- [ ] Slot 0 (out of turn) tries to drag — drag is disabled.
- [ ] Slot 1 plays a valid second move connecting to existing tiles. Confirm.
- [ ] Slot 2 plays an invalid move (off-grid via dragging into a corner that yields disconnection / single tile). Confirm red banner with Russian reason; pending tiles persist; recall works; resubmit a valid move works.
- [ ] Close one tab; confirm other two see `connected: false` for that slot; reopen the same URL; confirm reconnect works.
- [ ] Stop server; confirm `data/game.json` exists and reflects last accepted state. Restart server; confirm all three tabs reconnect into the same game.
- [ ] Run `npm run demo` — confirm scripted runner still completes without changes.

If all checks pass, M3 is done.

- [ ] **Open a PR** for `feat/m3-place-and-submit` against `main` once smoke is green:

```bash
git push -u origin feat/m3-place-and-submit
gh pr create --title "M3: place-and-submit" --body "$(cat <<'EOF'
## Summary
- Replaces M2 auto-script with a real lobby seated by `?slot=N&name=…` URL params.
- Server dispatches `submitMove`; other client actions stub to "not yet implemented".
- Client gains drag-and-drop (dnd-kit), pending-placement client state, Submit / Recall All buttons, and an inline error banner.
- New `Game.fromState` + atomic save let the server reload from `data/game.json` on boot.

## Test plan
- [ ] `npm run typecheck && npm test`
- [ ] `npm run demo`
- [ ] Manual three-tab smoke per Task 16 in the plan
EOF
)"
```

---

## Self-Review Notes

1. **Spec coverage:**
   - §3.1 boot path → Task 6, with reload from saved game.
   - §3.2 connections seating → Tasks 5 + 6.
   - §3.3 dispatch table → Task 6 (stubs) + Task 7 (submitMove integration coverage).
   - §3.4 submitMove → Task 6 implementation, Task 7 tests.
   - §3.5 atomic persistence → Task 4.
   - §3.6 Game.fromState → Task 3.
   - §4.1 URL identity → Task 9.
   - §4.2 store additions → Task 9.
   - §4.3 dnd-kit drag setup → Tasks 11–12.
   - §4.4 ghost rendering → Task 12.
   - §4.5 Submit/Recall buttons → Task 13.
   - §4.6 server-response handling → Task 10.
   - §4.7 ErrorBanner → Task 14.
   - §7 testing → Tasks 5/7 + smoke Task 16.

2. **Placeholder check:** every step contains the actual code or command needed.

3. **Type consistency:** `ClientMessage` / `ServerMessage` from Task 1 are used by `server/index.ts` (Task 6) and `client/src/ws.ts` (Task 10). Store API names (`addPending`, `removePending`, `clearPending`, `setError`, `setIdentity`) are reused in Tasks 11–14. `useDraggable` id = `tile.id`; `useDroppable` id = `sq-{row}-{col}` — used consistently across Tile/Square/onDragEnd.
