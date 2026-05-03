# Interactive Draw-for-Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current "automatic, server-side draw-for-order" with an interactive ritual: each player clicks their own face-down tile to reveal a letter; ties trigger another round of clicks among the tied players; once a unique first player is found, racks are dealt and the game starts.

**Architecture:** Introduce a new `'drawing'` `GamePhase` between `'waiting'` and `'playing'`. The engine holds an ephemeral `drawState: DrawState | null` on `GameState` that exposes the in-progress round (round number, candidate slots, who has drawn so far and which letter they got). A new `drawTile` client message lets a player draw their own tile; the server validates and broadcasts. When all candidates have drawn, the engine either resolves to `playing` (dealing racks, pushing the existing `DrawForOrderRecord` capturing the *initial* round only) or creates a fresh tiebreak round of just the tied slots. `DrawState` is persisted as part of the saved game so a server restart mid-draw resumes correctly. Free draw order: each candidate draws independently in any order; UI for non-current-viewer slots just shows face-down tiles that flip when that player clicks on their own browser.

**Tech Stack:** TypeScript (Node 20, strict), Vitest, Express + ws, React 19, Tailwind 4, Zustand.

---

## File Structure

- `shared/types.ts` — modify: extend `GamePhase` with `'drawing'`; add `DrawState` type; add `drawState: DrawState | null` to `GameState`; add `drawTile` to `ClientMessage` union.
- `server/game.ts` — modify: split `startGame()` into setup + `drawForOrderTile(slot)`; track candidate set across rounds; deal racks only on resolution.
- `server/index.ts` — modify: route `drawTile` message; allow it during `drawing` phase (not in-game `assertTurn` path).
- `tests/game.test.ts` (or new `tests/draw-for-order.test.ts`) — engine behavior.
- `tests/server.test.ts` — protocol round-trip for `drawTile`.
- `client/src/store.ts` — pass `drawState` through (it lives on `GameState`, no extra wiring beyond destructuring).
- `client/src/ws.ts` — add `sendDrawTile()`.
- `client/src/components/DrawForOrderScreen.tsx` — new overlay component.
- `client/src/App.tsx` — mount `DrawForOrderScreen` when `phase === 'drawing'`; the existing `formatDrawForOrder` banner still fires on transition to `'playing'`.

---

## Task 1: Extend shared types

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add `DrawState` type and extend `GamePhase` / `GameState` / `ClientMessage`**

Edit `shared/types.ts`. Replace the `GamePhase` line and the `GameState` type, add `DrawState` near `DrawForOrderRecord`, and extend `ClientMessage`:

```ts
export type DrawState = {
  round: number;            // 1 = initial three-way; 2+ = tiebreak rounds
  candidates: Slot[];       // slots still in contention this round (subset of [0,1,2])
  draws: { slot: Slot; letter: Letter | null }[]; // already-revealed draws this round (null = blank)
};

export type GamePhase = 'waiting' | 'drawing' | 'playing' | 'finished';

export type GameState = {
  phase: GamePhase;
  players: [Player, Player, Player];
  turnIndex: Slot;
  board: Board;
  bag: Tile[];
  centerBonusUsed: boolean;
  events: GameEvent[];
  startedAt: number | null;
  drawState: DrawState | null;
};
```

Extend `ClientMessage` union to add `| { type: 'drawTile' }`:

```ts
export type ClientMessage =
  | { type: 'join'; slot: Slot; name: string; password: string }
  | { type: 'submitMove'; placements: Placement[]; helperSlot?: Slot }
  | { type: 'claimBlank'; row: number; col: number; myTileId: string }
  | { type: 'pass' }
  | { type: 'redraw' }
  | { type: 'toggleRackVisible'; visible: boolean }
  | { type: 'endGame' }
  | { type: 'revertLastTurn' }
  | { type: 'newGame' }
  | { type: 'drawTile' };
```

- [ ] **Step 2: Run typecheck — expect failures everywhere `GameState` is constructed without `drawState`**

Run: `npm run typecheck`
Expected: Errors in `server/game.ts` (constructor + persistence load), `server/index.ts` (`lobbySnapshot()`), `server/persistence.ts` (load/save). These are fixed in Task 2 and Task 3.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): add 'drawing' phase, DrawState, and drawTile client message"
```

---

## Task 2: Engine — split `startGame()` and add `drawForOrderTile()`

**Files:**
- Modify: `server/game.ts`
- Test: `tests/game.test.ts`

The current `startGame()` runs the entire draw-for-order loop synchronously. Split it: `startGame()` now only validates and transitions to `drawing` (initializing `drawState`); a new `drawForOrderTile(slot)` reveals one player's tile and, when all candidates have drawn, either resolves to `playing` or starts a tiebreak round.

**Behavior contract:**
- `startGame()`: requires all 3 connected; sets `phase = 'drawing'`, `drawState = { round: 1, candidates: [0,1,2], draws: [] }`. Does **not** push any event yet, does **not** deal racks.
- `drawForOrderTile(slot)`: throws if `phase !== 'drawing'`, if `slot` is not in `drawState.candidates`, or if `slot` already drew this round. Otherwise: pull one tile from `bag`, push `{ slot, letter }` (or `null` for blanks) onto `drawState.draws`, **return the tile to the bag immediately** (so it stays in play; matches current behavior). When `draws.length === candidates.length`, compute the lowest letter via `compareLetterOrder`. If unique winner: deal 7-tile racks, set `turnIndex = winner`, push the existing `DrawForOrderRecord` (with `draws` capturing the **initial round-1** draw — *not* tiebreak rounds), set `phase = 'playing'`, set `startedAt`, clear `drawState`. If tied: increment `round`, set `candidates` to the tied slots, clear `draws`.

The "initial round draws" snapshot must be captured on round 1 only, stashed on the `Game` instance (private field), and surfaced in the eventual `DrawForOrderRecord`.

- [ ] **Step 1: Add a failing test for `startGame()` transitioning to drawing without dealing racks**

Append to `tests/game.test.ts` (or create `tests/draw-for-order.test.ts` if you prefer a focused file — pick one and stick with it for all tests in this task):

```ts
describe('interactive draw-for-order', () => {
  function ready(seed = 1): Game {
    const g = new Game({ seed });
    g.joinPlayer(0, 'A');
    g.joinPlayer(1, 'B');
    g.joinPlayer(2, 'C');
    return g;
  }

  it('startGame transitions to drawing phase without dealing racks', () => {
    const g = ready();
    g.startGame();
    const s = g.snapshot();
    expect(s.phase).toBe('drawing');
    expect(s.drawState).toEqual({ round: 1, candidates: [0, 1, 2], draws: [] });
    for (const p of s.players) expect(p.rack).toEqual([]);
    expect(s.events.filter((e) => e.kind === 'drawForOrder')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `npx vitest run tests/game.test.ts -t "startGame transitions to drawing"`
Expected: FAIL — current `startGame()` sets `phase = 'playing'` and deals racks.

- [ ] **Step 3: Refactor `startGame()` to only enter the drawing phase**

In `server/game.ts`:

1. Add private field for stashing the initial-round draws and a `bagFromTiles` import is already present.

```ts
  private initialDrawSnapshot: { slot: Slot; letter: Letter | null }[] | null = null;
```

2. Replace the body of `startGame()` with:

```ts
  startGame(): void {
    if (!this.state.players.every((p) => p.connected)) {
      throw new Error('Cannot start until all three slots are connected');
    }
    this.state.phase = 'drawing';
    this.state.drawState = { round: 1, candidates: [0, 1, 2], draws: [] };
    this.initialDrawSnapshot = null;
  }
```

3. Add `drawState: null` to the initial `this.state = { … }` literal in the constructor.

4. Add `drawState` handling to `Game.fromState` — `structuredClone` already covers it, but verify the cloned `state.drawState` is preserved.

5. In `snapshot()`: nothing extra needed — `structuredClone` carries `drawState`.

- [ ] **Step 4: Run the failing test — verify it passes**

Run: `npx vitest run tests/game.test.ts -t "startGame transitions to drawing"`
Expected: PASS.

- [ ] **Step 5: Add a failing test for `drawForOrderTile` recording a draw**

Append:

```ts
  it('drawForOrderTile records the slot+letter and keeps the tile in the bag', () => {
    const g = ready();
    g.startGame();
    const bagBefore = g.snapshot().bag.length;
    g.drawForOrderTile(0);
    const s = g.snapshot();
    expect(s.drawState?.draws.length).toBe(1);
    expect(s.drawState?.draws[0]?.slot).toBe(0);
    expect(s.bag.length).toBe(bagBefore); // tile returned to bag
    expect(s.phase).toBe('drawing');
  });

  it('drawForOrderTile rejects non-candidate slots and double-draws', () => {
    const g = ready();
    g.startGame();
    g.drawForOrderTile(0);
    expect(() => g.drawForOrderTile(0)).toThrow(/already drawn/);
    // pretend we resolve and then re-enter drawing with a tighter candidate set is covered by tiebreak test
  });

  it('drawForOrderTile throws when phase is not drawing', () => {
    const g = ready();
    expect(() => g.drawForOrderTile(0)).toThrow(/not in drawing phase/);
  });
```

- [ ] **Step 6: Run the tests — verify they fail**

Run: `npx vitest run tests/game.test.ts -t "drawForOrderTile"`
Expected: FAIL — `drawForOrderTile` not defined.

- [ ] **Step 7: Implement `drawForOrderTile` (without resolution)**

Add the method to the `Game` class in `server/game.ts`:

```ts
  drawForOrderTile(slot: Slot): void {
    if (this.state.phase !== 'drawing' || this.state.drawState === null) {
      throw new Error('Game is not in drawing phase');
    }
    const ds = this.state.drawState;
    if (!ds.candidates.includes(slot)) {
      throw new Error(`Slot ${slot} is not a draw candidate`);
    }
    if (ds.draws.some((d) => d.slot === slot)) {
      throw new Error(`Slot ${slot} has already drawn this round`);
    }
    const tile = drawTiles(this.bag, 1)[0]!;
    const letter: Letter | null = tile.isBlank ? null : tile.letter;
    ds.draws.push({ slot, letter });
    returnTiles(this.bag, [tile]);
    this.state.bag = this.bag.tiles;

    if (ds.round === 1 && ds.draws.length === ds.candidates.length && this.initialDrawSnapshot === null) {
      this.initialDrawSnapshot = ds.draws.map((d) => ({ slot: d.slot, letter: d.letter }));
    }

    if (ds.draws.length < ds.candidates.length) return;
    this.resolveDrawRound();
  }

  private resolveDrawRound(): void {
    const ds = this.state.drawState!;
    const sorted = [...ds.draws].sort((a, b) => compareLetterOrder(a.letter, b.letter));
    const best = sorted[0]!;
    const tied = sorted.filter((d) => compareLetterOrder(d.letter, best.letter) === 0);

    if (tied.length === 1) {
      const firstSlot = best.slot;
      for (const p of this.state.players) {
        const drawn = drawTiles(this.bag, 7);
        addTilesToRack(p.rack, drawn);
      }
      this.state.events.push({
        kind: 'drawForOrder',
        draws: this.initialDrawSnapshot ?? ds.draws.map((d) => ({ slot: d.slot, letter: d.letter })),
        firstSlot,
        timestamp: Date.now(),
      });
      this.state.turnIndex = firstSlot;
      this.state.phase = 'playing';
      this.state.bag = this.bag.tiles;
      this.state.startedAt = Date.now();
      this.state.drawState = null;
      this.initialDrawSnapshot = null;
      return;
    }

    // Tiebreak: new round with only the tied slots.
    this.state.drawState = {
      round: ds.round + 1,
      candidates: tied.map((d) => d.slot),
      draws: [],
    };
  }
```

Also add `initialDrawSnapshot: null` to the type-shape inside `Game.fromState` so the narrowing matches. Update `Mutable` accordingly:

```ts
    type Mutable = {
      bag: Bag;
      state: GameState;
      lastSnapshot: null;
      lastActionRecords: null;
      initialDrawSnapshot: null;
    };
    (g as unknown as Mutable).bag = bag;
    (g as unknown as Mutable).state = cloned;
    (g as unknown as Mutable).lastSnapshot = null;
    (g as unknown as Mutable).lastActionRecords = null;
    (g as unknown as Mutable).initialDrawSnapshot = null;
```

(Persistence covers mid-draw resume via `state.drawState`; `initialDrawSnapshot` is reconstructed on resolution from `drawState.draws` if absent — the fallback after `??` handles the case.)

- [ ] **Step 8: Run the tests — verify they pass**

Run: `npx vitest run tests/game.test.ts -t "drawForOrderTile"`
Expected: PASS.

- [ ] **Step 9: Add a failing test for resolution to `playing` after three unique draws**

```ts
  it('resolves to playing and deals racks once a unique winner emerges', () => {
    // Use a seed that yields three distinct letters on round 1.
    // We don't depend on a specific seed: simulate by repeatedly creating fresh games until non-tied.
    let g!: Game;
    for (let s = 1; s < 200; s++) {
      const candidate = ready(s);
      candidate.startGame();
      candidate.drawForOrderTile(0);
      candidate.drawForOrderTile(1);
      candidate.drawForOrderTile(2);
      if (candidate.snapshot().phase === 'playing') {
        g = candidate;
        break;
      }
    }
    if (!g) throw new Error('Could not find a non-tied seed in range');

    const s = g.snapshot();
    expect(s.phase).toBe('playing');
    expect(s.drawState).toBeNull();
    for (const p of s.players) expect(p.rack.length).toBe(7);
    const ev = s.events.find((e) => e.kind === 'drawForOrder');
    expect(ev).toBeDefined();
    if (ev?.kind === 'drawForOrder') {
      expect(ev.draws.length).toBe(3);
      expect([0, 1, 2]).toContain(ev.firstSlot);
    }
  });
```

- [ ] **Step 10: Run — verify it passes** (resolution code from Step 7 already covers it)

Run: `npx vitest run tests/game.test.ts -t "resolves to playing"`
Expected: PASS.

- [ ] **Step 11: Add a failing test for tiebreak round behavior**

```ts
  it('starts a tiebreak round when two or more slots tie', () => {
    // Find a seed that produces a tie on round 1.
    let g!: Game;
    for (let s = 1; s < 500; s++) {
      const candidate = ready(s);
      candidate.startGame();
      candidate.drawForOrderTile(0);
      candidate.drawForOrderTile(1);
      candidate.drawForOrderTile(2);
      const ds = candidate.snapshot().drawState;
      if (candidate.snapshot().phase === 'drawing' && ds && ds.round === 2) {
        g = candidate;
        break;
      }
    }
    if (!g) throw new Error('Could not find a tied seed in range');

    const s = g.snapshot();
    expect(s.phase).toBe('drawing');
    expect(s.drawState?.round).toBe(2);
    expect(s.drawState?.draws).toEqual([]);
    expect(s.drawState?.candidates.length).toBeGreaterThanOrEqual(2);
    for (const p of s.players) expect(p.rack).toEqual([]); // racks not yet dealt
  });
```

- [ ] **Step 12: Run — verify the test passes**

Run: `npx vitest run tests/game.test.ts -t "tiebreak"`
Expected: PASS.

- [ ] **Step 13: Run the full engine test suite**

Run: `npm test`
Expected: PASS. The pre-existing `startGame draw-for-order` test in `tests/game.test.ts` (if any) that asserted automatic resolution will break — update it: instead of expecting `phase === 'playing'` immediately, expect `phase === 'drawing'`, then call `drawForOrderTile(0/1/2)` and re-assert. If a test was checking `events[0]` being a `DrawForOrderRecord` post-`startGame()`, move that assertion to after the three `drawForOrderTile` calls (and pick a non-tied seed via the loop pattern above, or if the original test used a fixed seed that happens to be non-tied, just add the three calls inline).

- [ ] **Step 14: Commit**

```bash
git add server/game.ts tests/game.test.ts shared/types.ts
git commit -m "feat(engine): split startGame into interactive drawForOrderTile"
```

---

## Task 3: Persistence and lobby snapshot — keep `drawState` round-trip-safe

**Files:**
- Modify: `server/index.ts` (lobby snapshot)
- Verify: `server/persistence.ts` (no change expected — JSON round-trip handles `drawState`)
- Test: `tests/persistence.test.ts`

- [ ] **Step 1: Add `drawState: null` to `lobbySnapshot()` in `server/index.ts`**

Edit `lobbySnapshot()` — append `drawState: null,` to the returned object:

```ts
  function lobbySnapshot(): GameState {
    return {
      phase: 'waiting',
      players: ([0, 1, 2] as Slot[]).map((i) => ({
        slot: i,
        name: seats[i]!.name ?? familyConfig.players[i].name,
        connected: seats[i]!.ws !== null,
        rack: [],
        rackVisible: true,
        score: 0,
        redrawEligible: false,
        canRevert: false,
      })) as unknown as GameState['players'],
      turnIndex: 0,
      board: createEmptyBoard(),
      bag: [],
      centerBonusUsed: false,
      events: [],
      startedAt: null,
      drawState: null,
    };
  }
```

- [ ] **Step 2: Add a failing test that mid-draw state survives a save/load**

In `tests/persistence.test.ts` (or add a new section there):

```ts
it('persists drawState across save/load mid-draw', () => {
  const dir = mkdtempSync();
  const g = new Game({ seed: 7 });
  g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
  g.startGame();
  g.drawForOrderTile(0);
  saveActiveGame(dir, g.snapshot());
  const loaded = loadActiveGame(dir);
  expect(loaded?.phase).toBe('drawing');
  expect(loaded?.drawState?.draws.length).toBe(1);
  expect(loaded?.drawState?.draws[0]?.slot).toBe(0);
});
```

(Use whatever `mkdtempSync` helper / pattern the existing `persistence.test.ts` already uses — copy from a sibling test in the same file.)

- [ ] **Step 3: Run — confirm it passes (persistence is JSON, no schema lock)**

Run: `npx vitest run tests/persistence.test.ts`
Expected: PASS (no code change needed in persistence.ts).

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts tests/persistence.test.ts
git commit -m "feat(server): include drawState in lobby snapshot; cover persistence"
```

---

## Task 4: Server — route the `drawTile` message

**Files:**
- Modify: `server/index.ts`
- Test: `tests/server.test.ts` (or wherever WS protocol tests live — search for an existing `'submitMove'` or `'pass'` test as the pattern)

- [ ] **Step 1: Add a failing test that a connected player can draw their tile via WS**

Find the file with WS round-trip tests (e.g., `tests/server.test.ts`). Add:

```ts
it('drawTile reveals the player\'s letter and broadcasts updated drawState', async () => {
  const { wsA, wsB, wsC, msgsA } = await connectThree();
  // After all three join, server starts the game → phase becomes 'drawing'
  await waitFor(() => latestState(msgsA)?.phase === 'drawing');
  wsA.send(JSON.stringify({ type: 'drawTile' }));
  await waitFor(() => latestState(msgsA)?.drawState?.draws.some((d) => d.slot === 0));
  const ds = latestState(msgsA)!.drawState!;
  expect(ds.draws.find((d) => d.slot === 0)).toBeDefined();
});
```

(Re-use the helpers (`connectThree`, `waitFor`, `latestState`) defined alongside other tests in the same file — match the existing style.)

- [ ] **Step 2: Run — confirm failure ("Unknown message type")**

Run: `npx vitest run tests/server.test.ts -t "drawTile reveals"`
Expected: FAIL — server returns `{ type: 'error', message: 'Unknown message type' }`.

- [ ] **Step 3: Add the `drawTile` case to `attachInGameHandler`**

In `server/index.ts`, inside the `switch (msg.type)` of `attachInGameHandler`, add a case before `default:`:

```ts
        case 'drawTile':
          handleEngineAction(ws, () => game!.drawForOrderTile(slot));
          return;
```

`handleEngineAction` already saves + broadcasts; archiving on `phase === 'finished'` won't fire since drawing → playing is the path.

- [ ] **Step 4: Run — verify the test passes**

Run: `npx vitest run tests/server.test.ts -t "drawTile reveals"`
Expected: PASS.

- [ ] **Step 5: Run full test suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/index.ts tests/server.test.ts
git commit -m "feat(server): route drawTile message to engine"
```

---

## Task 5: Client — `sendDrawTile` and store wiring

**Files:**
- Modify: `client/src/ws.ts`
- Modify: `client/src/store.ts` (only if `drawState` needs explicit pass-through — likely no change since the store keeps the full `GameState`)

- [ ] **Step 1: Add `sendDrawTile` to the WS client**

Find the existing helpers in `client/src/ws.ts` (e.g., `sendPass`, `sendRedraw`, `sendSubmitMove`). Add the same shape:

```ts
export function sendDrawTile(): void {
  send({ type: 'drawTile' });
}
```

(Match the `send`/`socket.send` pattern used by `sendPass` in this file — do not invent a new abstraction.)

- [ ] **Step 2: Verify the store already exposes `state.drawState`**

Open `client/src/store.ts`. The store holds `state: GameState | null`; `drawState` is reachable as `store.state?.drawState`. No change needed unless the store uses a curated subset — if so, add `drawState` to the exposed slice. Confirm by `grep -n 'drawState\|GameState' client/src/store.ts`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/ws.ts client/src/store.ts
git commit -m "feat(client): sendDrawTile WS helper"
```

---

## Task 6: Client — `DrawForOrderScreen` overlay

**Files:**
- Create: `client/src/components/DrawForOrderScreen.tsx`
- Modify: `client/src/App.tsx`

The overlay renders during `phase === 'drawing'`. Three face-down "envelope" tiles, one per slot, in slot order. Each shows:
- The player's name above it.
- If that slot has already drawn this round → a face-up tile showing the Cyrillic letter (or `★` for blank, the same convention used in `MoveLog` for `formatDrawForOrder`).
- If that slot has NOT yet drawn AND that slot is the current viewer's slot AND it's a candidate → a "Тяни!" button.
- Else → a face-down/grayed-out placeholder ("Ждём…").

Above the row, a small banner showing the round number (e.g., "Жребий" for round 1, "Перетягивание (раунд N)" for round 2+).

- [ ] **Step 1: Create the component**

Create `client/src/components/DrawForOrderScreen.tsx`:

```tsx
import type { DrawState, GameState, Slot } from '@shared/types';
import { sendDrawTile } from '../ws.js';

type Props = {
  state: GameState;
  mySlot: Slot;
};

export function DrawForOrderScreen({ state, mySlot }: Props): JSX.Element | null {
  const ds = state.drawState;
  if (state.phase !== 'drawing' || ds === null) return null;
  return (
    <div className="fixed inset-0 z-50 bg-paper/95 flex flex-col items-center justify-center gap-8">
      <h2 className="text-3xl font-display">{ds.round === 1 ? 'Жребий' : `Перетягивание — раунд ${ds.round}`}</h2>
      <p className="text-ink/70 max-w-md text-center">
        {ds.round === 1
          ? 'Каждый игрок тянет по букве. Кто ближе к началу алфавита — ходит первым.'
          : 'Между игроками с одинаковой буквой — ещё один раунд.'}
      </p>
      <div className="flex gap-6">
        {([0, 1, 2] as Slot[]).map((slot) => (
          <DrawSlotCard
            key={slot}
            slot={slot}
            mySlot={mySlot}
            ds={ds}
            playerName={state.players[slot]!.name}
          />
        ))}
      </div>
    </div>
  );
}

function DrawSlotCard({
  slot, mySlot, ds, playerName,
}: { slot: Slot; mySlot: Slot; ds: DrawState; playerName: string }): JSX.Element {
  const isCandidate = ds.candidates.includes(slot);
  const drawn = ds.draws.find((d) => d.slot === slot);
  const isMe = slot === mySlot;
  const canClick = isCandidate && drawn === undefined && isMe;

  return (
    <div className="flex flex-col items-center gap-2 w-32">
      <div className="text-sm text-ink/80">{playerName}</div>
      {drawn !== undefined ? (
        <div className="w-20 h-24 rounded-md bg-tile-face flex items-center justify-center text-4xl font-display border-2 border-ink/40">
          {drawn.letter ?? '★'}
        </div>
      ) : !isCandidate ? (
        <div className="w-20 h-24 rounded-md bg-ink/10 flex items-center justify-center text-ink/40 text-xs">
          —
        </div>
      ) : canClick ? (
        <button
          className="w-20 h-24 rounded-md bg-tile-back text-paper font-display text-lg hover:opacity-90"
          onClick={() => sendDrawTile()}
        >
          Тяни!
        </button>
      ) : (
        <div className="w-20 h-24 rounded-md bg-tile-back text-paper/60 flex items-center justify-center text-xs">
          Ждём…
        </div>
      )}
    </div>
  );
}
```

If the project does not have `bg-tile-face` / `bg-tile-back` / `font-display` / `bg-paper` Tailwind classes, fall back to the literals already used in `Tile.tsx` and `FinishedScreen.tsx` (open them and copy the actual class names — do not invent new tokens).

- [ ] **Step 2: Mount the overlay in `App.tsx`**

Open `client/src/App.tsx`. Locate where `FinishedScreen` is mounted (`{state.phase === 'finished' && <FinishedScreen state={state} />}`). Add a sibling line:

```tsx
{state.phase === 'drawing' && <DrawForOrderScreen state={state} mySlot={mySlot} />}
```

`mySlot` is the local player's slot — find how it's already derived in `App.tsx` (search for `mySlot` or `slot` referenced from `localStorage`/the store). If it's not already a local variable, pull it from the store the same way other components in `App.tsx` do.

Add the import at the top:

```tsx
import { DrawForOrderScreen } from './components/DrawForOrderScreen.js';
```

- [ ] **Step 3: Adjust the existing draw-banner gating in `App.tsx`**

Currently `App.tsx` shows a banner when `state.phase === 'playing' && events.length === 1 && lastEvent?.kind === 'drawForOrder'`. That still works — the banner appears the moment we transition out of drawing. No change needed unless the banner is also gated on `phase === 'waiting'` (it isn't — verify by re-reading the relevant lines).

- [ ] **Step 4: Typecheck and run the dev server to smoke-test**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run dev` (in one terminal), open three browser tabs as the three slots (per CLAUDE.md instructions), confirm:
- After all three join, the `DrawForOrderScreen` overlay appears.
- Each tab can click only its own "Тяни!" button.
- After all three draws, either the screen disappears and the regular play UI appears with the first-player banner, OR (on a tie) the round counter advances and a new "Тяни!" appears for the tied players.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/DrawForOrderScreen.tsx client/src/App.tsx
git commit -m "feat(client): interactive draw-for-order overlay"
```

---

## Task 7: Spec update

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-scrabble-design.md`

The spec is the source of truth — update it to describe the interactive draw.

- [ ] **Step 1: Find the draw-for-order section in the spec**

Run: `grep -n -i "draw.*order\|жреб\|first player" docs/superpowers/specs/2026-04-30-scrabble-design.md`

- [ ] **Step 2: Edit the relevant section**

Replace the auto-draw description with a paragraph along the lines of:

> **Жребий (draw-for-order).** Once all three players are seated, the game enters a `drawing` phase. Each player clicks their own face-down tile to reveal a letter. After all three have drawn, the player whose letter is earliest in the Russian alphabet (`compareLetterOrder`) goes first; tiles are returned to the bag. On a tie, only the tied players draw again in a subsequent round; this repeats until a unique winner emerges. Racks are dealt only after resolution. The historical `DrawForOrderRecord` event captures the **initial** three-way draw; tiebreak rounds are not persisted.

Adjust wording to match the spec's existing tone and section style.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-scrabble-design.md
git commit -m "docs(spec): describe interactive жребий"
```

---

## Self-Review Checklist (run after writing the plan, before execution)

- **Spec coverage:** every behavioral change above (drawing phase, drawTile message, tiebreak loop, persistence) has a task. ✓
- **No placeholders:** every code step shows actual code; no "TODO" / "similar to". ✓
- **Type consistency:** `DrawState` has the same field names (`round`, `candidates`, `draws`) and the same `{ slot, letter }` shape across types, engine, and UI. ✓
- **Existing test compatibility:** Task 2 Step 13 explicitly addresses the now-broken automatic-resolution test in the original suite.
- **YAGNI:** tiebreak rounds are not persisted in events (no schema change to `DrawForOrderRecord`). The `initialDrawSnapshot` field on `Game` is the only ephemeral thing added — falls back to `drawState.draws` if absent, so server restart mid-round-1 still produces a valid record.
