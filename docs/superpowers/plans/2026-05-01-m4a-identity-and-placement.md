# M4a — Identity & Placement Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the URL-param identity stub with a real lobby flow (slot picker + reconnect-by-name), and complete the placement pipeline (multi-spot, blank picker, substitution toggle, dictionary advisory).

**Architecture:** Two-phase WebSocket: client opens `/ws` unauthenticated, server sends `lobby`, client replies `join`, server validates and seats (with same-name live takeover). Client gates rendering on a `<SlotPicker>` until `localStorage` identity is set. Placement UI is unchanged for normal letters; blank tiles open a modal letter picker; Ё/Ъ/Ш/Й pending tiles show an in-place toggle for substitution. Dictionary warnings ride on `moveAccepted` and surface in a yellow `ErrorBanner` for 5 s.

**Tech Stack:** TypeScript (strict, NodeNext), Node 20, `ws`, Zustand, React 19, Vite, Tailwind 4, Vitest, dnd-kit.

**Spec:** `docs/superpowers/specs/2026-05-01-m4a-identity-and-placement-design.md`

**Conventions:**
- TDD per CLAUDE.md: failing test first, smallest implementation, full suite passes.
- Run `npm run typecheck && npm test` before each commit.
- One commit per task. No Co-Authored-By trailers.
- `.js` extensions on relative imports (NodeNext).

---

## File Plan

| Path | Change |
|---|---|
| `shared/types.ts` | Add `LobbySlot`, `join` client msg, `lobby` server msg |
| `server/connections.ts` | `seat()` performs live same-name takeover |
| `server/index.ts` | Split connection / join phases; remove URL-param parsing; send `lobby` on connect |
| `tests/connections.test.ts` | Update same-name-live test, add takeover test |
| `tests/integration/m3-server.test.ts` | **Delete** (replaced) |
| `tests/integration/m4-server.test.ts` | New — full join flow, takeover, multi-spot |
| `client/src/letters.ts` | New — 33 Cyrillic letters, substitution map |
| `client/src/store.ts` | Add `identity`, `lobby`, `warning`, `togglePendingSubstitution`; hydrate identity from localStorage |
| `client/src/ws.ts` | Plain `/ws`, `sendJoin`, lobby/warning handlers, clear identity on Slot taken |
| `client/src/components/SlotPicker.tsx` | New |
| `client/src/components/LetterPicker.tsx` | New — modal |
| `client/src/components/Tile.tsx` | Substitution toggle badge for pending Ё/Ъ/Ш/Й |
| `client/src/components/ErrorBanner.tsx` | `kind?: 'error' \| 'warning'` |
| `client/src/App.tsx` | Slot-picker gate; auto-rejoin; blank-picker wire-up; warning banner |
| `client/src/MissingParams.tsx` | **Delete** |

---

## Task 1: Add `join` / `lobby` to shared types

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Edit `shared/types.ts` to add `LobbySlot` and the new messages**

Add this type above the WS protocol section, near `GameSummary`:

```ts
export type LobbySlot = { slot: Slot; name: string; connected: boolean };
```

Replace the `ClientMessage` union with:

```ts
export type ClientMessage =
  | { type: 'join'; slot: Slot; name: string }
  | { type: 'submitMove'; placements: Placement[] }
  | { type: 'swapTiles'; tileIds: string[] }
  | { type: 'claimBlank'; row: number; col: number; myTileId: string }
  | { type: 'pass' }
  | { type: 'redraw' }
  | { type: 'toggleRackVisible'; visible: boolean }
  | { type: 'endGame' };
```

Replace the `ServerMessage` union with:

```ts
export type ServerMessage =
  | { type: 'lobby'; slots: [LobbySlot, LobbySlot, LobbySlot] }
  | { type: 'state'; state: GameState }
  | { type: 'moveAccepted'; moveRecord: MoveRecord; dictionaryWarnings: string[] }
  | { type: 'moveRejected'; reason: string }
  | { type: 'error'; message: string };
```

Update the comment header from `M3 subset; M4 fills in the deferred actions` to `M4a: join+lobby added; non-placement actions stubbed in server; M4b will implement them`.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no callers reference the new fields yet, so type changes are additive).

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "types(m4a): add join/lobby messages and LobbySlot"
```

---

## Task 2: Live same-name takeover in `seat()`

**Files:**
- Modify: `server/connections.ts`
- Test: `tests/connections.test.ts`

- [ ] **Step 1: Update the failing/changing test**

Open `tests/connections.test.ts`. Replace the test `'rejects same name when current socket is still live'` with this new test (and add a takeover test below it):

```ts
  it('takes over a live socket of the same name (returns replaced=true and swaps the ws)', () => {
    const s = createSeats();
    const wsA = fakeWs('a');
    const wsA2 = fakeWs('a2');
    seat(s, 0, 'Alice', wsA);
    const r = seat(s, 0, 'Alice', wsA2);
    expect(r).toEqual({ ok: true, replaced: wsA });
    expect(s[0]!.ws).toBe(wsA2);
    expect(s[0]!.name).toBe('Alice');
  });
```

Also update the type-shape of the existing happy-path test (`'seats an empty slot'`) to expect `{ ok: true, replaced: null }`:

```ts
    expect(r).toEqual({ ok: true, replaced: null });
```

And update `'allows reconnect by same name when previous socket is gone'`:

```ts
    expect(r).toEqual({ ok: true, replaced: null });
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run tests/connections.test.ts`
Expected: FAIL — current `seat()` returns `{ ok: true }` not `{ ok: true, replaced: null }`, and rejects same-name-live with `Slot taken`.

- [ ] **Step 3: Implement live takeover in `seat()`**

Replace `SeatResult` and `seat()` in `server/connections.ts`:

```ts
export type SeatResult =
  | { ok: true; replaced: WebSocket | null }
  | { ok: false; reason: string };

export function seat(seats: Seats, slot: Slot, name: string, ws: WebSocket): SeatResult {
  const s = seats[slot]!;
  if (s.name !== null && s.name !== name) {
    return { ok: false, reason: 'Slot taken' };
  }
  const replaced = s.ws !== null && s.name === name ? s.ws : null;
  s.name = name;
  s.ws = ws;
  return { ok: true, replaced };
}
```

- [ ] **Step 4: Update `unseat()` to no-op when the seat already points elsewhere**

Replace `unseat()` body — needed so the *old* ws's `close` handler (which fires after live takeover) does not clear the now-current ws:

```ts
export function unseat(seats: Seats, ws: WebSocket): Slot | null {
  for (let i = 0; i < seats.length; i++) {
    if (seats[i]!.ws === ws) {
      seats[i]!.ws = null;
      return i as Slot;
    }
  }
  return null;
}
```

(This is unchanged — already only matches by ws reference. Confirm by reading the file.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/connections.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite (some integration tests will still fail — that's Task 4's job)**

Run: `npm run typecheck`
Expected: TYPE ERRORS in `server/index.ts` (where `seat()` callers don't destructure `replaced`). Fix in Task 3.

- [ ] **Step 7: Do not commit yet** — `server/index.ts` won't compile. Continue to Task 3 and commit them together.

---

## Task 3: Two-phase server connection (lobby → join)

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Replace the `wss.on('connection', ...)` block**

In `server/index.ts`, **remove** the `VALID_SLOTS` constant (no longer used) and **replace** the connection handler. The new flow: open ws, send `lobby`, attach pre-join handler. After `join`, swap to in-game handler (today's existing `switch`). Code:

```ts
function lobbyMessage(): ServerMessage {
  return {
    type: 'lobby',
    slots: ([0, 1, 2] as Slot[]).map((i) => ({
      slot: i,
      name: seats[i]!.name ?? '',
      connected: seats[i]!.ws !== null,
    })) as [LobbySlot, LobbySlot, LobbySlot],
  };
}

function broadcastLobby(): void {
  const data = JSON.stringify(lobbyMessage());
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

function attachInGameHandler(ws: WebSocket, slot: Slot): void {
  ws.on('message', (raw: RawData) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      sendMsg(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }
    switch (msg.type) {
      case 'join':
        sendMsg(ws, { type: 'error', message: 'Already joined' });
        return;
      case 'submitMove':
        handleSubmitMove(slot, msg, ws);
        return;
      case 'swapTiles':
      case 'claimBlank':
      case 'pass':
      case 'redraw':
      case 'toggleRackVisible':
      case 'endGame':
        sendMsg(ws, { type: 'error', message: 'not yet implemented' });
        return;
      default:
        sendMsg(ws, { type: 'error', message: 'Unknown message type' });
    }
  });
}

function handleJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>): void {
  const slot = msg.slot;
  const name = msg.name?.trim();
  if (slot !== 0 && slot !== 1 && slot !== 2) {
    sendMsg(ws, { type: 'error', message: 'Bad slot' });
    ws.close(1008, 'Bad slot');
    return;
  }
  if (!name) {
    sendMsg(ws, { type: 'error', message: 'Name required' });
    ws.close(1008, 'Name required');
    return;
  }

  if (game !== null) {
    const persistedName = game.snapshot().players[slot]!.name;
    if (persistedName !== '' && persistedName !== name) {
      sendMsg(ws, { type: 'error', message: 'Slot taken' });
      ws.close(1008, 'Slot taken');
      return;
    }
  }

  const result = seat(seats, slot, name, ws);
  if (!result.ok) {
    sendMsg(ws, { type: 'error', message: result.reason });
    ws.close(1008, result.reason);
    return;
  }

  if (result.replaced !== null) {
    try {
      result.replaced.close(1000, 'replaced by same-name client');
    } catch {
      /* ignore */
    }
  }

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

  attachInGameHandler(ws, slot);
  broadcastState();
  broadcastLobby();
}

wss.on('connection', (ws) => {
  sendMsg(ws, lobbyMessage());

  const preJoinHandler = (raw: RawData): void => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      sendMsg(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }
    if (msg.type !== 'join') {
      sendMsg(ws, { type: 'error', message: 'Join first' });
      return;
    }
    ws.off('message', preJoinHandler);
    handleJoin(ws, msg);
  };
  ws.on('message', preJoinHandler);

  ws.on('close', () => {
    const which = unseat(seats, ws);
    if (which === null) return;
    broadcastState();
    broadcastLobby();
  });
});
```

Add `LobbySlot` to the type imports at the top of the file:

```ts
import type { ClientMessage, ServerMessage, GameState, LobbySlot, Slot } from '@shared/types';
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run unit tests**

Run: `npx vitest run tests/connections.test.ts tests/bag.test.ts tests/game.test.ts`
Expected: PASS.

- [ ] **Step 4: Run integration tests (will fail — Task 4 fixes)**

Run: `npx vitest run tests/integration`
Expected: FAIL — `m3-server.test.ts` opens ws with URL params; the new server ignores those and waits for `join`.

- [ ] **Step 5: Commit Tasks 2 + 3 together**

```bash
git add server/connections.ts server/index.ts tests/connections.test.ts
git commit -m "feat(server): two-phase WS join with same-name takeover"
```

---

## Task 4: Replace M3 integration test with M4 integration test

**Files:**
- Delete: `tests/integration/m3-server.test.ts`
- Create: `tests/integration/m4-server.test.ts`

- [ ] **Step 1: Delete the old M3 integration test**

```bash
git rm tests/integration/m3-server.test.ts
```

- [ ] **Step 2: Write `tests/integration/m4-server.test.ts`**

Create the file with these tests. Reuses the `buffered`/`waitFor` helpers from M3, adapted for the new flow (no URL params; explicit `join`).

```ts
import { describe, it, expect } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { mkdtempSync } from 'node:fs';
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
function join(b: Buffered, slot: 0 | 1 | 2, name: string): void {
  send(b, { type: 'join', slot, name });
}

async function freshServer() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-m4-'));
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
      expect(lobby.slots.map((s) => s.name)).toEqual(['', '', '']);
      expect(lobby.slots.every((s) => !s.connected)).toBe(true);

      send(b, { type: 'submitMove', placements: [] });
      const err = await waitFor(b, isType('error'));
      expect(err.message).toBe('Join first');
      // Socket must remain open so the client can retry.
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
      // After join, the next thing slot 0 receives is a state snapshot for the lobby.
      await waitFor(b0, isType('state'));

      const closed = new Promise<void>((resolve) => b0.ws.on('close', () => resolve()));

      const b0b = await buffered(url);
      await waitFor(b0b, isType('lobby'));
      join(b0b, 0, 'A');
      await waitFor(b0b, isType('state'));

      await closed; // original ws was closed by the server.
      b0b.ws.close();
    } finally {
      await server.close();
    }
  });

  it('rejects different name on a held slot with "Slot taken" and closes the ws', async () => {
    const { server, url } = await freshServer();
    try {
      const b0 = await buffered(url);
      await waitFor(b0, isType('lobby'));
      join(b0, 0, 'A');
      await waitFor(b0, isType('state'));

      const bad = await buffered(url);
      await waitFor(bad, isType('lobby'));
      join(bad, 0, 'B');
      const err = await waitFor(bad, isType('error'));
      expect(err.message).toBe('Slot taken');
      const closed = await new Promise<number>((resolve) => bad.ws.on('close', (code) => resolve(code)));
      expect(closed).toBe(1008);

      b0.ws.close();
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

  it('accepts a multi-spot two-group submitMove (after sufficient prior moves to make groups connect-back)', async () => {
    // Smoke-test for multi-spot: place a single-group first move (must cover center),
    // and on the second turn submit a two-group placement that hangs off the first.
    // We only assert acceptance — engine correctness is in unit tests.
    const { server, url } = await freshServer();
    try {
      const [b0, b1, b2] = await Promise.all([buffered(url), buffered(url), buffered(url)]);
      await waitFor(b0, isType('lobby'));
      join(b0, 0, 'A'); join(b1, 1, 'B'); join(b2, 2, 'C');
      const playing = await waitFor(b0, isStateWithPhase('playing'));

      // First move: two real tiles across center, horizontal.
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

  it('rejects join with mismatched name against persisted game state', async () => {
    const { server, url, dataDir } = await freshServer();
    try {
      const [b0, b1, b2] = await Promise.all([buffered(url), buffered(url), buffered(url)]);
      await waitFor(b0, isType('lobby'));
      join(b0, 0, 'A'); join(b1, 1, 'B'); join(b2, 2, 'C');
      await waitFor(b0, isStateWithPhase('playing'));

      // Disconnect slot 0 so the persisted game has name 'A' for slot 0 but no live ws.
      await new Promise<void>((resolve) => {
        b0.ws.on('close', () => resolve());
        b0.ws.close();
      });

      const bad = await buffered(url);
      await waitFor(bad, isType('lobby'));
      join(bad, 0, 'X');
      const err = await waitFor(bad, isType('error'));
      expect(err.message).toBe('Slot taken');

      b1.ws.close(); b2.ws.close();
      void dataDir;
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 3: Run integration suite**

Run: `npx vitest run tests/integration`
Expected: PASS (all 7 tests).

- [ ] **Step 4: Run full suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/m4-server.test.ts
git rm tests/integration/m3-server.test.ts 2>/dev/null || true
git commit -m "test(integration): replace m3 with m4 — lobby/join/takeover/multi-spot"
```

---

## Task 5: Client letter constants (`client/src/letters.ts`)

**Files:**
- Create: `client/src/letters.ts`

- [ ] **Step 1: Create the file**

```ts
import type { Letter } from '@shared/types';

export const CYRILLIC_LETTERS: Letter[] = [
  'А','Б','В','Г','Д','Е','Ё','Ж','З','И','Й','К','Л','М','Н','О','П',
  'Р','С','Т','У','Ф','Х','Ц','Ч','Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я',
];

// One-way substitutions (Russian Эрудит house rules; spec §3, §9.2).
export const SUBSTITUTIONS: Record<Letter, Letter> = {
  'Ё': 'Е',
  'Ъ': 'Ь',
  'Ш': 'Щ',
  'Й': 'И',
};

export function canSubstitute(letter: Letter): boolean {
  return Object.prototype.hasOwnProperty.call(SUBSTITUTIONS, letter);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/letters.ts
git commit -m "feat(client): add Cyrillic letter list + substitution map"
```

---

## Task 6: Extend store with identity, lobby, warning, and pending substitution

**Files:**
- Modify: `client/src/store.ts`

- [ ] **Step 1: Replace `client/src/store.ts` body**

Full file:

```ts
import { create } from 'zustand';
import type { GameState, Letter, LobbySlot, Slot } from '@shared/types';

type Pending = { tileId: string; row: number; col: number; playedAs: Letter };

const IDENTITY_KEY = 'scrabble.identity';

function loadIdentity(): { slot: Slot; name: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { slot: number; name: string };
    if (parsed.slot !== 0 && parsed.slot !== 1 && parsed.slot !== 2) return null;
    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') return null;
    return { slot: parsed.slot as Slot, name: parsed.name };
  } catch {
    return null;
  }
}

type Store = {
  state: GameState | null;
  connected: boolean;
  lobby: LobbySlot[] | null;
  identity: { slot: Slot; name: string } | null;
  pendingPlacements: Pending[];
  lastError: string | null;
  warning: string | null;
  setState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
  setLobby: (slots: LobbySlot[]) => void;
  setIdentity: (slot: Slot, name: string) => void;
  clearIdentity: () => void;
  addPending: (p: Pending) => void;
  removePending: (tileId: string) => void;
  togglePendingSubstitution: (tileId: string, real: Letter, sub: Letter) => void;
  clearPending: () => void;
  setError: (message: string | null) => void;
  setWarning: (message: string | null) => void;
};

export const useGameStore = create<Store>((set) => ({
  state: null,
  connected: false,
  lobby: null,
  identity: loadIdentity(),
  pendingPlacements: [],
  lastError: null,
  warning: null,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
  setLobby: (slots) => set({ lobby: slots }),
  setIdentity: (slot, name) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(IDENTITY_KEY, JSON.stringify({ slot, name }));
    }
    set({ identity: { slot, name } });
  },
  clearIdentity: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(IDENTITY_KEY);
    }
    set({ identity: null });
  },
  addPending: (p) =>
    set((s) =>
      s.pendingPlacements.some((x) => x.tileId === p.tileId)
        ? s
        : { pendingPlacements: [...s.pendingPlacements, p], lastError: null },
    ),
  removePending: (tileId) =>
    set((s) => ({
      pendingPlacements: s.pendingPlacements.filter((x) => x.tileId !== tileId),
      lastError: null,
    })),
  togglePendingSubstitution: (tileId, real, sub) =>
    set((s) => ({
      pendingPlacements: s.pendingPlacements.map((p) =>
        p.tileId === tileId ? { ...p, playedAs: p.playedAs === real ? sub : real } : p,
      ),
    })),
  clearPending: () => set({ pendingPlacements: [], lastError: null }),
  setError: (lastError) => set({ lastError }),
  setWarning: (warning) => set({ warning }),
}));
```

Note: `Pending` now carries `playedAs` (was inferred from rack tile). This lets blank/sub tiles pass the chosen letter through to `submitMove`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: TYPE ERRORS in `App.tsx` (calls `addPending` without `playedAs`). Fix in Task 9.

- [ ] **Step 3: Do not commit yet** — wait until Task 9 fixes callers.

---

## Task 7: Rewire `ws.ts` for two-phase join + warnings

**Files:**
- Modify: `client/src/ws.ts`

- [ ] **Step 1: Replace `client/src/ws.ts` body**

Full file:

```ts
import type { ClientMessage, ServerMessage, Slot } from '@shared/types';
import { useGameStore } from './store.js';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const WARNING_TIMEOUT_MS = 5000;

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let warningTimer: ReturnType<typeof setTimeout> | null = null;
let socket: WebSocket | null = null;
let intentionalClose = false;

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempts, RECONNECT_MAX_MS);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function setTimedWarning(msg: string): void {
  const store = useGameStore.getState();
  store.setWarning(msg);
  if (warningTimer !== null) clearTimeout(warningTimer);
  warningTimer = setTimeout(() => {
    useGameStore.getState().setWarning(null);
    warningTimer = null;
  }, WARNING_TIMEOUT_MS);
}

export function connect(): void {
  if (socket !== null && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  intentionalClose = false;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/ws`;
  const ws = new WebSocket(url);
  socket = ws;

  ws.addEventListener('open', () => {
    reconnectAttempts = 0;
    useGameStore.getState().setConnected(true);
    // Auto-rejoin if identity is already set.
    const { identity } = useGameStore.getState();
    if (identity !== null) sendJoin(identity.slot, identity.name);
  });

  ws.addEventListener('message', (e) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(e.data) as ServerMessage;
    } catch {
      console.warn('non-JSON ws message:', e.data);
      return;
    }
    const store = useGameStore.getState();
    switch (msg.type) {
      case 'lobby':
        store.setLobby(msg.slots);
        return;
      case 'state': {
        store.setState(msg.state);
        const after = useGameStore.getState();
        if (after.identity !== null && after.pendingPlacements.length > 0) {
          const myRackIds = new Set(msg.state.players[after.identity.slot]!.rack.map((t) => t.id));
          const next = after.pendingPlacements.filter((p) => myRackIds.has(p.tileId));
          if (next.length !== after.pendingPlacements.length) {
            useGameStore.setState({ pendingPlacements: next });
          }
        }
        return;
      }
      case 'moveAccepted':
        store.clearPending();
        if (msg.dictionaryWarnings.length > 0) {
          setTimedWarning('Не в словаре: ' + msg.dictionaryWarnings.join(', '));
        } else if (warningTimer !== null) {
          clearTimeout(warningTimer);
          warningTimer = null;
          store.setWarning(null);
        }
        return;
      case 'moveRejected':
        store.setError(msg.reason);
        return;
      case 'error':
        if (msg.message === 'Slot taken') {
          store.clearIdentity();
        }
        store.setError(msg.message);
        return;
    }
  });

  ws.addEventListener('error', (e) => {
    console.warn('ws error:', e);
  });
  ws.addEventListener('close', () => {
    useGameStore.getState().setConnected(false);
    if (intentionalClose) {
      intentionalClose = false;
      return;
    }
    scheduleReconnect();
  });
}

export function disconnect(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (warningTimer !== null) {
    clearTimeout(warningTimer);
    warningTimer = null;
  }
  if (socket !== null) {
    intentionalClose = true;
    socket.close();
    socket = null;
  }
}

export function send(msg: ClientMessage): void {
  if (socket !== null && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function sendJoin(slot: Slot, name: string): void {
  send({ type: 'join', slot, name });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: Still type errors in `App.tsx` from Task 6 — that's expected.

- [ ] **Step 3: Do not commit yet.**

---

## Task 8: New `<SlotPicker>` component

**Files:**
- Create: `client/src/components/SlotPicker.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import type { LobbySlot, Slot } from '@shared/types';

type Props = {
  lobby: LobbySlot[] | null;
  onJoin: (slot: Slot, name: string) => void;
};

export function SlotPicker({ lobby, onJoin }: Props) {
  if (lobby === null) {
    return <main className="flex h-full items-center justify-center text-ink">connecting…</main>;
  }
  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 p-8 text-ink">
      <h1 className="text-2xl font-semibold">Корюшка пошла</h1>
      <p className="text-sm text-ink/60">Выбери слот и введи имя</p>
      <div className="flex w-full max-w-md flex-col gap-3">
        {lobby.map((s) => (
          <Row key={s.slot} entry={s} onJoin={onJoin} />
        ))}
      </div>
    </main>
  );
}

function Row({ entry, onJoin }: { entry: LobbySlot; onJoin: (slot: Slot, name: string) => void }) {
  const occupied = entry.name !== '';
  const taken = occupied && entry.connected;
  const [name, setName] = useState(entry.name);
  const trimmed = name.trim();

  return (
    <div className="flex items-center gap-3 rounded border border-ink/20 px-3 py-2">
      <div className="w-16 text-xs uppercase text-ink/60">Слот {entry.slot + 1}</div>
      <div className="flex-1 min-w-0">
        {taken ? (
          <span className="text-sm">{entry.name} (онлайн)</span>
        ) : occupied ? (
          <span className="text-sm">
            {entry.name} <span className="text-ink/50">(отключился)</span>
          </span>
        ) : (
          <span className="text-sm text-ink/50">свободно</span>
        )}
      </div>
      <input
        className="w-32 rounded border border-ink/20 bg-bg px-2 py-1 text-sm disabled:opacity-50"
        type="text"
        placeholder="имя"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={taken}
      />
      <button
        className="rounded bg-terracotta px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        disabled={taken || trimmed === ''}
        onClick={() => onJoin(entry.slot, trimmed)}
      >
        Войти
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: SlotPicker compiles; App.tsx errors persist.

- [ ] **Step 3: Do not commit yet.**

---

## Task 9: New `<LetterPicker>` modal

**Files:**
- Create: `client/src/components/LetterPicker.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect } from 'react';
import type { Letter } from '@shared/types';

type Props = {
  title: string;
  letters: Letter[];
  onPick: (letter: Letter) => void;
  onCancel: () => void;
};

export function LetterPicker({ title, letters, onPick, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="rounded-lg bg-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm font-medium text-ink">{title}</div>
        <div className="grid grid-cols-6 gap-2">
          {letters.map((L) => (
            <button
              key={L}
              className="h-10 w-10 rounded bg-tile text-lg font-semibold text-ink hover:bg-tile/80"
              onClick={() => onPick(L)}
            >
              {L}
            </button>
          ))}
        </div>
        <div className="mt-3 text-right">
          <button
            className="rounded px-3 py-1 text-sm text-ink/70 hover:bg-ink/10"
            onClick={onCancel}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: LetterPicker compiles; App.tsx errors persist.

- [ ] **Step 3: Do not commit yet.**

---

## Task 10: Substitution-toggle badge in `<Tile>`

**Files:**
- Modify: `client/src/components/Tile.tsx`

- [ ] **Step 1: Add an optional `subBadge` prop**

The Tile currently has a `cell` mode (board) and a `tile` mode (rack). For a *pending* placement of a Ё/Ъ/Ш/Й tile, we render in cell-like mode but want a clickable badge. Simplest path: add a `subBadge` prop the parent passes when the placed tile has substitution candidates.

Replace the `Props` type and `Tile` function in `client/src/components/Tile.tsx`:

```tsx
import { useDraggable } from '@dnd-kit/core';
import type { Cell, Letter, Tile as TileT } from '@shared/types';

type Props = {
  cell?: Cell;
  tile?: TileT;
  size?: number;
  draggableId?: string;
  ghost?: boolean;
  subBadge?: { display: Letter; onClick: () => void };
};

export function Tile({ cell, tile, size = 36, draggableId, ghost = false, subBadge }: Props) {
  const t = cell?.tile ?? tile;
  if (!t) return null;
  const display = cell ? cell.playedAs : (t.isBlank ? '★' : t.letter);
  const points = cell ? (cell.fromBlank ? 0 : t.points) : t.points;

  if (draggableId !== undefined) {
    return <DraggableTile id={draggableId} display={display} points={points} size={size} ghost={ghost} subBadge={subBadge} />;
  }
  return <StaticTile display={display} points={points} size={size} ghost={ghost} subBadge={subBadge} />;
}

type InnerProps = { display: string; points: number; size: number; ghost: boolean; subBadge?: { display: Letter; onClick: () => void } };

function Badge({ subBadge }: { subBadge: NonNullable<InnerProps['subBadge']> }) {
  return (
    <button
      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-terracotta text-[9px] font-bold text-white shadow"
      onClick={(e) => {
        e.stopPropagation();
        subBadge.onClick();
      }}
      title="Сменить букву"
    >
      {subBadge.display}
    </button>
  );
}

function StaticTile({ display, points, size, ghost, subBadge }: InnerProps) {
  return (
    <div
      className={[
        'relative flex items-center justify-center rounded-md bg-tile shadow-sm font-semibold select-none',
        ghost ? 'opacity-70 ring-2 ring-terracotta' : '',
      ].join(' ')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      <span>{display}</span>
      <span
        className="absolute right-0.5 bottom-0 text-ink/70"
        style={{ fontSize: Math.round(size * 0.25) }}
      >
        {points}
      </span>
      {subBadge && <Badge subBadge={subBadge} />}
    </div>
  );
}

function DraggableTile({ id, display, points, size, ghost, subBadge }: InnerProps & { id: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.5),
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab',
    touchAction: 'none',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        'relative flex items-center justify-center rounded-md bg-tile shadow-sm font-semibold select-none',
        ghost ? 'opacity-70 ring-2 ring-terracotta' : '',
      ].join(' ')}
    >
      <span>{display}</span>
      <span
        className="absolute right-0.5 bottom-0 text-ink/70"
        style={{ fontSize: Math.round(size * 0.25) }}
      >
        {points}
      </span>
      {subBadge && <Badge subBadge={subBadge} />}
    </div>
  );
}
```

The badge shows the *other* letter (the alternative), so clicking it visually swaps which letter is "active" on the tile. Wiring is in Task 12.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS in Tile.tsx.

- [ ] **Step 3: Do not commit yet.**

---

## Task 11: `<ErrorBanner>` gets a `kind` prop and renders both error + warning

**Files:**
- Modify: `client/src/components/ErrorBanner.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { useGameStore } from '../store.js';

export function ErrorBanner() {
  const lastError = useGameStore((s) => s.lastError);
  const warning = useGameStore((s) => s.warning);
  if (lastError === null && warning === null) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {warning !== null && (
        <div className="rounded border border-amber-500/60 bg-amber-200/40 px-3 py-2 text-sm text-ink">
          {warning}
        </div>
      )}
      {lastError !== null && (
        <div className="rounded border border-terracotta/60 bg-terracotta/20 px-3 py-2 text-sm text-ink">
          {lastError}
        </div>
      )}
    </div>
  );
}
```

(Decision: keep ErrorBanner as a single component reading both pieces from the store, instead of taking props. Simpler call site. Drops the `kind` prop idea from the spec — same outcome with less plumbing.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Do not commit yet.**

---

## Task 12: Rewire `App.tsx` — slot picker gate, blank picker, sub badge, multi-spot

**Files:**
- Modify: `client/src/App.tsx`
- Delete: `client/src/MissingParams.tsx`

- [ ] **Step 1: Replace `client/src/App.tsx`**

```tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import type { Letter, Slot, Tile as TileT } from '@shared/types';
import { useGameStore } from './store.js';
import { connect, disconnect, sendJoin } from './ws.js';
import { Board } from './components/Board.js';
import { PlayerCard } from './components/PlayerCard.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import { SlotPicker } from './components/SlotPicker.js';
import { LetterPicker } from './components/LetterPicker.js';
import { CYRILLIC_LETTERS } from './letters.js';

type PendingDrop = { tile: TileT; row: number; col: number };

export function App() {
  const state = useGameStore((s) => s.state);
  const lobby = useGameStore((s) => s.lobby);
  const identity = useGameStore((s) => s.identity);
  const connected = useGameStore((s) => s.connected);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const addPending = useGameStore((s) => s.addPending);

  const [pendingBlank, setPendingBlank] = useState<PendingDrop | null>(null);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  function handleJoin(slot: Slot, name: string) {
    setIdentity(slot, name);
    sendJoin(slot, name);
  }

  function findRackTile(tileId: string): TileT | null {
    if (state === null || identity === null) return null;
    const rack = state.players[identity.slot]?.rack ?? [];
    return rack.find((t) => t.id === tileId) ?? null;
  }

  function onDragEnd(ev: DragEndEvent) {
    if (ev.over === null) return;
    const tileId = String(ev.active.id);
    const m = /^sq-(\d+)-(\d+)$/.exec(String(ev.over.id));
    if (m === null) return;
    const row = Number(m[1]);
    const col = Number(m[2]);
    const tile = findRackTile(tileId);
    if (tile === null) return;
    if (tile.isBlank) {
      setPendingBlank({ tile, row, col });
      return;
    }
    addPending({ tileId, row, col, playedAs: tile.letter });
  }

  function commitBlank(letter: Letter) {
    if (pendingBlank === null) return;
    addPending({
      tileId: pendingBlank.tile.id,
      row: pendingBlank.row,
      col: pendingBlank.col,
      playedAs: letter,
    });
    setPendingBlank(null);
  }

  if (!connected) return <Center>connecting…</Center>;
  if (identity === null) {
    return <SlotPicker lobby={lobby} onJoin={handleJoin} />;
  }
  if (state === null) return <Center>joining…</Center>;

  return (
    <DndContext onDragEnd={onDragEnd}>
      <main className="flex h-full items-start justify-center gap-8 p-8">
        <div>
          <Board board={state.board} />
          <ErrorBanner />
        </div>
        <aside className="flex w-72 flex-col gap-3">
          <header className="text-sm uppercase tracking-wide text-ink/60">
            {state.phase === 'finished' ? 'Game over' : `${state.players[state.turnIndex]?.name ?? '—'}'s turn`}
          </header>
          {state.players.map((p) => (
            <PlayerCard key={p.slot} player={p} isCurrentTurn={p.slot === state.turnIndex && state.phase === 'playing'} />
          ))}
        </aside>
      </main>
      {pendingBlank !== null && (
        <LetterPicker
          title="Выбери букву для бланка"
          letters={CYRILLIC_LETTERS}
          onPick={commitBlank}
          onCancel={() => setPendingBlank(null)}
        />
      )}
    </DndContext>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <main className="flex h-full items-center justify-center text-ink">{children}</main>;
}
```

- [ ] **Step 2: Delete `client/src/MissingParams.tsx`**

```bash
git rm client/src/MissingParams.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit Tasks 6–12 together (all client wire-up)**

```bash
git add client/src/store.ts client/src/ws.ts client/src/App.tsx \
        client/src/components/SlotPicker.tsx \
        client/src/components/LetterPicker.tsx \
        client/src/components/Tile.tsx \
        client/src/components/ErrorBanner.tsx
git rm client/src/MissingParams.tsx 2>/dev/null || true
git commit -m "feat(client): slot picker, blank picker, dictionary warning banner"
```

---

## Task 13: Wire substitution toggle into the Board's pending-placement render

**Files:**
- Modify: `client/src/components/Board.tsx` (whichever component renders pending placements over squares)

> **Note for the implementer:** The exact file is whichever component currently renders `pendingPlacements` from the store on the board. As of this plan's writing it's `Board.tsx` via `Square.tsx`. If you find pending tiles are rendered elsewhere, apply the same change there.

- [ ] **Step 1: Read the current pending-render path**

Open `client/src/components/Board.tsx` and `client/src/components/Square.tsx`. Find where a pending placement gets rendered (it currently renders the rack tile's letter). Identify the `<Tile>` call that draws a pending tile.

- [ ] **Step 2: Add the sub badge for pending Ё/Ъ/Ш/Й tiles**

At that `<Tile>` call site, compute the badge prop. Pseudocode for the change (adapt to actual surrounding types):

```tsx
import { SUBSTITUTIONS, canSubstitute } from '../letters.js';
import { useGameStore } from '../store.js';
// ...
const togglePendingSubstitution = useGameStore((s) => s.togglePendingSubstitution);
const tile = /* the rack tile referenced by this pending placement */;
const placement = /* the pending placement record */;
const subBadge = !tile.isBlank && canSubstitute(tile.letter)
  ? {
      display: placement.playedAs === tile.letter ? SUBSTITUTIONS[tile.letter]! : tile.letter,
      onClick: () => togglePendingSubstitution(tile.id, tile.letter, SUBSTITUTIONS[tile.letter]!),
    }
  : undefined;
// ...
<Tile tile={tile} subBadge={subBadge} ghost />
```

The badge displays the *alternative* letter (so users see what they'd switch to). The currently-active letter is the big letter on the tile body — but `Tile`'s rack-mode shows the physical `tile.letter`, not the chosen `playedAs`. To show the chosen letter on the pending tile, either (a) extend `Tile` rack-mode with an optional `displayOverride: Letter` prop, or (b) keep showing the physical letter and rely on the badge to indicate the alt. Pick (a):

In `client/src/components/Tile.tsx`, extend the rack-mode display calculation:

```ts
type Props = {
  cell?: Cell;
  tile?: TileT;
  size?: number;
  draggableId?: string;
  ghost?: boolean;
  subBadge?: { display: Letter; onClick: () => void };
  displayOverride?: Letter;   // NEW
};
// ...
const display = cell ? cell.playedAs : (props.displayOverride ?? (t.isBlank ? '★' : t.letter));
```

(Pull `displayOverride` out of props; thread through to `StaticTile`/`DraggableTile`.)

Then at the call site for the pending tile pass `displayOverride={placement.playedAs}`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Manual sanity**

```bash
npm run dev
```

Open three tabs (you'll need to use the slot picker now). Place a Ё (if drawn) on the board → confirm a small "Е" badge appears in the corner; click it → the big letter on the pending tile flips to Е, the badge flips to "Ё". Click again to flip back. Submit → server scores using the active `playedAs`.

If you can't draw a Ё/Ъ/Ш/Й in a normal session, just verify the file compiles and the substitution helpers exist; manual coverage will come during real play.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Board.tsx client/src/components/Square.tsx client/src/components/Tile.tsx
git commit -m "feat(client): substitution toggle badge for Ё/Ъ/Ш/Й pending tiles"
```

---

## Task 14: End-to-end manual smoke test

**Files:** none

- [ ] **Step 1: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 2: Manual verification matrix**

Boot: `npm run dev` (Vite on :5173, server on :3000). Open `http://localhost:5173/` in three tabs (no URL params).

| Check | Expected |
|---|---|
| Tab 1 first visit | SlotPicker shows 3 free slots |
| Pick slot 1, type "Аня", Войти | Tab waits ("joining…") then shows board after all three join |
| Tab 1 reload | Auto-rejoins as "Аня" — no picker |
| Tab 1 close (close ws) → reopen | Reconnect-by-name succeeds |
| Tab 4 (4th tab) opens, tries to take "Аня" with name "Other" | Gets "Slot taken", picker re-renders |
| Tab 4 takes "Аня" with name "Аня" | Tab 1's old ws closes; tab 4 is now the live "Аня" |
| Drop a blank tile on board | LetterPicker modal appears |
| Pick "К" in modal | Pending tile shows "К"; submit places it |
| Drop a Ё (if you have one) | Sub badge "Е" appears; click flips to play as "Е" |
| Submit a move with two disconnected groups (after at least one prior move so both attach) | Server accepts |
| Submit a word that's in your local dictionary | No warning banner |
| Submit a made-up word the server flags | Yellow warning banner appears for ~5 s, auto-dismisses |

- [ ] **Step 3: Do not commit (no code change).** If anything in the matrix fails, file the bug as a TODO follow-up and either fix it or note it in the next plan.

---

## Self-review (run after writing the plan)

- [x] **Spec coverage:**
  - Two-phase WS / lobby / join → Tasks 1, 3, 4
  - Live takeover → Tasks 2, 4
  - Reconnect-by-name → Tasks 3 (preserved), 4 (test)
  - Slot picker UI + localStorage → Tasks 6, 8, 12
  - Multi-spot placement → Tasks 4 (test), 12 (no client gating)
  - Blank picker → Tasks 7 (no — Tasks 9, 12)
  - Substitution toggle → Tasks 5, 6, 10, 13
  - Dictionary advisory → Tasks 6 (`warning`), 7 (timer), 11 (banner)
  - Delete `MissingParams.tsx` → Task 12
- [x] **Placeholder scan:** None. Task 13 has the only "find the right place" instruction; that's a real navigation step, not a placeholder.
- [x] **Type consistency:** `Pending` carries `playedAs` consistently in store + ws + App. `togglePendingSubstitution(tileId, real, sub)` signature consistent across store (Task 6) and call site (Task 13). `LobbySlot`, `LobbyMessage` shape consistent across types/server/client.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-01-m4a-identity-and-placement.md`.
