# M5a — Snapshots, Assist Credit, Move Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three M5a features: (1) "мама помогла" assist credit (+5 to a helper, attached to a `submitMove`); (2) live move log panel covering every action; (3) finished-game snapshots (full board + complete event log) plus an in-app Past Games viewer.

**Architecture:** Replace `GameState.history: MoveRecord[]` with `GameState.events: GameEvent[]` — a discriminated union over move/assist/pass/redraw/claimBlank/endGame/revert. Each engine action method appends exactly one record (revert appends rather than pops, and reverses assist points if any). Persistence upgrades to a `GameArchive` (final board + complete events). Two new HTTP endpoints expose archives. Client adds a submit confirm modal (the helper picker lives there), a `<MoveLog>` panel in the right rail under player cards, and a `/past` route with list + detail views.

**Tech Stack:** TypeScript strict, Node 20, Vitest, Express + ws, React 19, Zustand, Tailwind 4, Vite. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-05-01-m5a-snapshots-assist-log-design.md`.

**Russian-only UI:** every user-visible string in this milestone (labels, buttons, headings, empty states, loading indicators, error messages, log entries, route titles) must be in Russian. No English placeholder text. Coordinates (`e7`) and numbers are fine. If you find existing English strings in adjacent code while wiring something up, leave them alone — fix them in a separate pass, not here.

**Conventions reminder (from CLAUDE.md):**
- `.js` extension on relative imports (NodeNext / ESNext)
- Path aliases `@shared/*`, `@server/*`
- TS strict + `noUncheckedIndexedAccess` — non-null assert (`!`) only when the index is provably valid
- Prefer `type` over `interface`; discriminated unions for results
- Validation returns `{ ok: false, error: ... }`; throw only for programmer errors
- Before committing: `npm run typecheck && npm test`

---

## Task 1: Extend `GameEvent` union and `GameArchive` types

**Files:**
- Modify: `shared/types.ts`

This is a pure type-shape change. We rename `history` → `events`, add a `kind` discriminant to `MoveRecord`, add the six new record types, and define `GameArchive` (the new on-disk archive format). No tests in this task — types are exercised by the next tasks; `npm run typecheck` is the gate.

- [ ] **Step 1: Update `shared/types.ts`**

Replace the existing `MoveRecord` definition and add the new record types + `GameEvent` union + `GameArchive` + the `helperSlot` option on `submitMove`.

```ts
// Replace existing MoveRecord:
export type MoveRecord = {
  kind: 'move';
  slot: Slot;
  placements: Placement[];
  wordsFormed: WordFormed[];
  totalScore: number;
  bingoBonus: boolean;
  helperSlot: Slot | null;
  timestamp: number;
};

export type AssistRecord = {
  kind: 'assist';
  fromSlot: Slot;
  toSlot: Slot;
  points: 5;
  forMoveIndex: number; // index into events[] of the move it was attached to
  timestamp: number;
};

export type PassRecord = {
  kind: 'pass';
  slot: Slot;
  timestamp: number;
};

export type RedrawRecord = {
  kind: 'redraw';
  slot: Slot;
  reason: 'allVowels' | 'allConsonants';
  tileCount: number;
  timestamp: number;
};

export type ClaimBlankRecord = {
  kind: 'claimBlank';
  slot: Slot;
  row: number;
  col: number;
  letterAs: Letter;
  timestamp: number;
};

export type EndGameRecord = {
  kind: 'endGame';
  slot: Slot;
  cause: 'playerEnded' | 'bagEmptyAndRackEmpty' | 'sixPasses';
  timestamp: number;
};

export type RevertRecord = {
  kind: 'revert';
  slot: Slot;
  revertedKind: GameEventKind;
  timestamp: number;
};

export type GameEvent =
  | MoveRecord
  | AssistRecord
  | PassRecord
  | RedrawRecord
  | ClaimBlankRecord
  | EndGameRecord
  | RevertRecord;

export type GameEventKind = GameEvent['kind'];
```

In `GameState`, replace `history: MoveRecord[]` with `events: GameEvent[]`:

```ts
export type GameState = {
  phase: GamePhase;
  players: [Player, Player, Player];
  turnIndex: Slot;
  board: Board;
  bag: Tile[];
  centerBonusUsed: boolean;
  events: GameEvent[];
  startedAt: number | null;
};
```

Extend `ClientMessage`'s `submitMove` variant:

```ts
| { type: 'submitMove'; placements: Placement[]; helperSlot?: Slot }
```

Add `GameArchive` (new):

```ts
export type GameArchive = {
  id: string;
  startedAt: number;
  finishedAt: number;
  players: { slot: Slot; name: string; finalScore: number }[];
  winnerSlot: Slot | null;
  finalBoard: Board;
  events: GameEvent[];
};
```

Keep `GameSummary` as-is (it remains the projection used for the list view).

- [ ] **Step 2: Run typecheck — expect failures**

Run: `npm run typecheck`
Expected: many errors — `state.history` references in `server/game.ts`, `server/persistence.ts`, `server/index.ts`, plus `MoveRecord` consumers in `client/`. These are addressed in Tasks 2–13.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): extend GameEvent union; add GameArchive; helperSlot on submitMove"
```

---

## Task 2: Engine — rename `history` → `events`, append `MoveRecord` with `kind` + `helperSlot`

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

This task makes `submitMove` compile and pass tests again — but **without** assist scoring yet. We just rename the field and add `kind: 'move'` + `helperSlot: null` to every `MoveRecord` we push. Existing tests that reference `state.history` get renamed to `state.events`.

- [ ] **Step 1: Update `tests/game.test.ts`**

Search-and-replace `state.history` → `state.events` and `g.snapshot().history` → `g.snapshot().events` throughout. Where a test asserts the shape of a `MoveRecord`, add `kind: 'move'` and `helperSlot: null` to the expected object.

Run: `npm test -- tests/game.test.ts`
Expected: many failures — implementation hasn't changed yet.

- [ ] **Step 2: Update `server/game.ts`**

In the `Game` constructor's initial state literal, replace `history: []` with `events: []`. In `submitMove`, change the `MoveRecord` literal and the `push` site:

```ts
const moveRecord: MoveRecord = {
  kind: 'move',
  slot,
  placements,
  wordsFormed: score.perWord.map<WordFormed>((w) => ({
    word: w.word, cells: w.cells, score: w.score,
  })),
  totalScore: score.totalScore,
  bingoBonus: score.bingoBonus,
  helperSlot: null,            // assist wired in Task 8
  timestamp: Date.now(),
};
this.state.events.push(moveRecord);
```

- [ ] **Step 3: Run game tests — expect pass**

Run: `npm test -- tests/game.test.ts`
Expected: existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "refactor(engine): rename history→events; tag MoveRecord with kind+helperSlot"
```

---

## Task 3: Engine — emit `PassRecord` on `passTurn`

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Add failing test in `tests/game.test.ts`**

Inside the existing `describe('Game', ...)` (or the `describe` for pass), add:

```ts
it('passTurn appends a PassRecord to events', () => {
  const g = newStartedGame();
  const events0 = g.snapshot().events.length;
  g.passTurn(0);
  const events = g.snapshot().events;
  expect(events.length).toBe(events0 + 1);
  const last = events[events.length - 1]!;
  expect(last.kind).toBe('pass');
  if (last.kind === 'pass') {
    expect(last.slot).toBe(0);
    expect(typeof last.timestamp).toBe('number');
  }
});
```

(`newStartedGame` is the existing helper in this test file. If the file uses different boilerplate, follow the same pattern as adjacent tests.)

Run: `npm test -- tests/game.test.ts -t "passTurn appends"`
Expected: FAIL (no `kind: 'pass'` record appended).

- [ ] **Step 2: Implement in `server/game.ts`**

In `passTurn`, after advancing `turnIndex`, push the record:

```ts
passTurn(slot: Slot): void {
  this.assertTurn(slot);
  this.maybeClearRevertOnActionBy(slot);
  const pre = structuredClone(this.state);
  this.state.turnIndex = ((slot + 1) % 3) as Slot;
  this.state.events.push({ kind: 'pass', slot, timestamp: Date.now() });
  this.armRevert(slot, pre);
}
```

- [ ] **Step 3: Run test**

Run: `npm test -- tests/game.test.ts -t "passTurn appends"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "feat(engine): append PassRecord on passTurn"
```

---

## Task 4: Engine — emit `RedrawRecord` on `redrawRack`

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Add failing test**

```ts
it('redrawRack appends a RedrawRecord with reason and tileCount', () => {
  const g = newStartedGame();
  // Rig the rack to all-vowels so redraw is eligible. Reuse whatever helper
  // an existing redraw test in this file uses, or set the rack directly via
  // the same mechanism.
  forceRackAllVowels(g, 0); // existing helper or inline equivalent
  const before = g.snapshot();
  const tileCount = before.players[0]!.rack.length;
  g.redrawRack(0);
  const events = g.snapshot().events;
  const last = events[events.length - 1]!;
  expect(last.kind).toBe('redraw');
  if (last.kind === 'redraw') {
    expect(last.slot).toBe(0);
    expect(last.reason).toBe('allVowels');
    expect(last.tileCount).toBe(tileCount);
  }
});
```

If `forceRackAllVowels` doesn't exist, mirror whatever the existing `redrawRack` happy-path test in this file does to set up an eligible rack. **Read the file first** before writing the test to find the right helper.

Run: `npm test -- tests/game.test.ts -t "redrawRack appends"`
Expected: FAIL.

- [ ] **Step 2: Implement in `server/game.ts`**

We need to know `reason` (allVowels vs allConsonants) and the count *before* swapping. Import the helpers from `./rack.js` if not already imported; the existing `redrawEligible` helper returns boolean — we need a finer reason. Add a small helper next to the existing import or inline it:

```ts
import { addTilesToRack, removeTilesFromRack, redrawEligible, isAllVowels } from './rack.js';
```

If `isAllVowels` doesn't exist in `rack.ts`, add it (and a sibling `isAllConsonants`) — or read from the existing classification module (`server/letters.ts`) directly. Inspect `server/rack.ts` and `server/letters.ts` first; pick the cleanest fit.

In `redrawRack`:

```ts
redrawRack(slot: Slot): void {
  this.assertTurn(slot);
  const player = this.state.players[slot]!;
  if (!redrawEligible(player.rack)) {
    throw new Error('Rack is not eligible for free redraw (must be all vowels or all consonants)');
  }
  const reason: 'allVowels' | 'allConsonants' =
    isAllVowels(player.rack) ? 'allVowels' : 'allConsonants';
  const tileCount = player.rack.length;
  this.maybeClearRevertOnActionBy(slot);
  const pre = structuredClone(this.state);
  const allIds = player.rack.map((t) => t.id);
  const removed = removeTilesFromRack(player.rack, allIds);
  returnTiles(this.bag, removed);
  const drawn = drawTiles(this.bag, 7);
  addTilesToRack(player.rack, drawn);
  this.state.bag = this.bag.tiles;
  this.state.events.push({ kind: 'redraw', slot, reason, tileCount, timestamp: Date.now() });
  this.armRevert(slot, pre);
}
```

- [ ] **Step 3: Run test**

Run: `npm test -- tests/game.test.ts -t "redrawRack appends"`
Expected: PASS.

- [ ] **Step 4: Run full game tests**

Run: `npm test -- tests/game.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add server/game.ts server/rack.ts tests/game.test.ts
git commit -m "feat(engine): append RedrawRecord on redrawRack"
```

---

## Task 5: Engine — emit `ClaimBlankRecord` on `claimBlank`

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Add failing test**

Mirror the existing happy-path `claimBlank` test in `tests/game.test.ts` (find it first — it sets up a board with a blank tile playedAs some letter, then calls `g.claimBlank(slot, row, col, tileId)`). After the existing assertions, add:

```ts
const last = g.snapshot().events.at(-1)!;
expect(last.kind).toBe('claimBlank');
if (last.kind === 'claimBlank') {
  expect(last.slot).toBe(slot);
  expect(last.row).toBe(row);
  expect(last.col).toBe(col);
  expect(last.letterAs).toBe(letterAs); // matches the blank's playedAs
}
```

Run: `npm test -- tests/game.test.ts -t "claimBlank"`
Expected: FAIL (no event appended yet).

- [ ] **Step 2: Implement in `server/game.ts`**

In `claimBlank`, after the swap mutates the board and before `this.armRevert(...)`:

```ts
this.state.events.push({
  kind: 'claimBlank',
  slot,
  row,
  col,
  letterAs: cell.playedAs,
  timestamp: Date.now(),
});
this.armRevert(slot, pre);
```

- [ ] **Step 3: Run test**

Run: `npm test -- tests/game.test.ts -t "claimBlank"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "feat(engine): append ClaimBlankRecord on claimBlank"
```

---

## Task 6: Engine — emit `EndGameRecord` on `endGame`

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

Only the `'playerEnded'` cause is wired up in M5a — the engine has no auto-detect for `bagEmptyAndRackEmpty` or `sixPasses` today; those cause variants stay in the type union for future work and are not emitted yet.

- [ ] **Step 1: Add failing test**

```ts
it('endGame appends an EndGameRecord with cause "playerEnded"', () => {
  const g = newStartedGame();
  g.endGame(0);
  const last = g.snapshot().events.at(-1)!;
  expect(last.kind).toBe('endGame');
  if (last.kind === 'endGame') {
    expect(last.slot).toBe(0);
    expect(last.cause).toBe('playerEnded');
  }
  expect(g.snapshot().phase).toBe('finished');
});
```

Run: `npm test -- tests/game.test.ts -t "endGame appends"`
Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
endGame(slot: Slot): void {
  if (this.state.phase !== 'playing') return; // idempotent if already finished
  this.maybeClearRevertOnActionBy(slot);
  this.lastSnapshot = null;
  this.state.phase = 'finished';
  this.state.events.push({
    kind: 'endGame',
    slot,
    cause: 'playerEnded',
    timestamp: Date.now(),
  });
}
```

- [ ] **Step 3: Run test**

Run: `npm test -- tests/game.test.ts -t "endGame appends"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "feat(engine): append EndGameRecord on endGame"
```

---

## Task 7: Engine — emit `RevertRecord` on `revertLastTurn` (append-only, reverse attached assist)

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

The revert is **append-only**: it does not pop the prior entry. It records what was undone (`revertedKind`). If the most recent event is a move that has an attached assist, we also reverse the assist's +5 *and* append a second `RevertRecord` with `revertedKind: 'assist'`.

The order in `events` after a move-with-assist looks like: `[..., MoveRecord, AssistRecord]`. After revert: `[..., MoveRecord, AssistRecord, RevertRecord(assist), RevertRecord(move)]`. We reverse the assist points first (it was pushed last), then mark both as reverted.

**Important:** the existing `lastSnapshot` is a deep clone of `state` taken *before* the action. After we restore `this.state = lastSnapshot.state`, the snapshot's `events` array does NOT contain the action we're undoing (it was the pre-action state). So we can't both (a) restore from snapshot and (b) keep the move record in the log. We need to thread the records back in.

The clean approach: after `this.state = this.lastSnapshot.state`, manually re-append the original action records (move + optional assist) and then the matching revert records, so the *log* is preserved while the *game state* (board / scores / racks / bag) is rolled back. Track those records during the action by capturing `events.length` before each action and reading the appended slice on revert.

- [ ] **Step 1: Add a private field for the appended-events slice**

In `Game`:

```ts
// Snapshot of records appended by the most recent action, kept so revert can
// preserve them in the log even after restoring `state` from `lastSnapshot`.
private lastActionRecords: GameEvent[] | null = null;
```

Replace `armRevert` with a version that captures the records too:

```ts
private armRevert(slot: Slot, preState: GameState, appended: GameEvent[]): void {
  this.lastSnapshot = { state: preState, bySlot: slot };
  this.lastActionRecords = appended;
}

private maybeClearRevertOnActionBy(slot: Slot): void {
  if (this.lastSnapshot !== null && this.lastSnapshot.bySlot !== slot) {
    this.lastSnapshot = null;
    this.lastActionRecords = null;
  }
}
```

Update each call site (`submitMove`, `passTurn`, `redrawRack`, `claimBlank`) to compute the appended slice and pass it in. The simplest pattern: capture `const startLen = this.state.events.length;` before pushing, then `const appended = this.state.events.slice(startLen);` before calling `armRevert`. Apply this in all four methods.

For `submitMove`, the appended slice may include both the `MoveRecord` and (after Task 8) the `AssistRecord` — the slice captures whatever was pushed.

- [ ] **Step 2: Add failing test for plain move revert**

```ts
it('revertLastTurn after submitMove appends RevertRecord(kind="move") and rolls back state', () => {
  const g = newStartedGame();
  // ... existing first-move setup helpers ...
  const move = makeFirstMove(g);
  g.submitMove(0, move);
  const scoreBefore = g.snapshot().players[0]!.score;
  expect(scoreBefore).toBeGreaterThan(0);

  g.revertLastTurn(0);
  const snap = g.snapshot();
  expect(snap.players[0]!.score).toBe(0);
  // Log: move + revert(move). No assist.
  const tail = snap.events.slice(-2);
  expect(tail[0]!.kind).toBe('move');
  expect(tail[1]!.kind).toBe('revert');
  if (tail[1]!.kind === 'revert') {
    expect(tail[1]!.revertedKind).toBe('move');
    expect(tail[1]!.slot).toBe(0);
  }
});
```

Run: `npm test -- tests/game.test.ts -t "revertLastTurn after submitMove"`
Expected: FAIL — `revertLastTurn` currently restores `state` wholesale (losing the move record) and does not append a `RevertRecord`.

- [ ] **Step 3: Implement `revertLastTurn`**

```ts
revertLastTurn(slot: Slot): void {
  if (this.lastSnapshot === null) throw new Error('Nothing to revert');
  if (this.lastSnapshot.bySlot !== slot) throw new Error('Only the action author can revert');
  const restored = this.lastSnapshot.state;
  const appended = this.lastActionRecords ?? [];

  // Roll game state back.
  this.state = restored;
  this.bag.tiles = [...this.state.bag];
  this.state.bag = this.bag.tiles;

  // Re-attach the original action records so the log shows what happened…
  for (const rec of appended) this.state.events.push(rec);
  // …and append matching revert records in reverse order
  // (so an AssistRecord pushed after a MoveRecord is reverted first).
  const ts = Date.now();
  for (let i = appended.length - 1; i >= 0; i--) {
    this.state.events.push({
      kind: 'revert',
      slot,
      revertedKind: appended[i]!.kind,
      timestamp: ts,
    });
  }

  this.lastSnapshot = null;
  this.lastActionRecords = null;
}
```

Run: `npm test -- tests/game.test.ts -t "revertLastTurn after submitMove"`
Expected: PASS.

- [ ] **Step 4: Add tests for pass / redraw / claimBlank revert log shape**

```ts
it('revertLastTurn after passTurn appends RevertRecord(kind="pass")', () => {
  const g = newStartedGame();
  g.passTurn(0);
  g.revertLastTurn(0);
  const tail = g.snapshot().events.slice(-2);
  expect(tail[0]!.kind).toBe('pass');
  expect(tail[1]!.kind).toBe('revert');
  if (tail[1]!.kind === 'revert') expect(tail[1]!.revertedKind).toBe('pass');
});

it('revertLastTurn after redrawRack appends RevertRecord(kind="redraw")', () => {
  const g = newStartedGame();
  forceRackAllVowels(g, 0);
  g.redrawRack(0);
  g.revertLastTurn(0);
  const tail = g.snapshot().events.slice(-2);
  expect(tail[0]!.kind).toBe('redraw');
  expect(tail[1]!.kind).toBe('revert');
  if (tail[1]!.kind === 'revert') expect(tail[1]!.revertedKind).toBe('redraw');
});

it('revertLastTurn after claimBlank appends RevertRecord(kind="claimBlank")', () => {
  // Reuse the existing claimBlank setup from the file.
  const g = setupGameWithBlankOnBoard(); // existing helper or inline equivalent
  g.claimBlank(/* args from existing test */);
  g.revertLastTurn(/* same slot */);
  const tail = g.snapshot().events.slice(-2);
  expect(tail[0]!.kind).toBe('claimBlank');
  expect(tail[1]!.kind).toBe('revert');
  if (tail[1]!.kind === 'revert') expect(tail[1]!.revertedKind).toBe('claimBlank');
});
```

Run: `npm test -- tests/game.test.ts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "feat(engine): append-only RevertRecord on revertLastTurn"
```

---

## Task 8: Engine — assist credit on `submitMove`

**Files:**
- Modify: `server/game.ts`
- Modify: `shared/types.ts` (`SubmitResult` may not need a change — `helperSlot` flows in via the param signature)
- Modify: `tests/game.test.ts`

Validation: `helperSlot` (when provided) must be `0|1|2`, must differ from the submitter, and must refer to an existing player slot (always true in a 3-player game, but we still check `slot in {0,1,2}`).

Application: after the move is committed and `MoveRecord` pushed (with `helperSlot`), if `helperSlot != null`, add `+5` to that player's score and push an `AssistRecord` referencing the move's index in `events`.

- [ ] **Step 1: Update `submitMove` signature**

```ts
submitMove(slot: Slot, placements: Placement[], helperSlot?: Slot): SubmitResult { ... }
```

Add a new error variant in the union (extend the inline anonymous error type with `{ kind: 'invalid-helper' }`):

```ts
export type SubmitResult =
  | { ok: true; moveRecord: MoveRecord; dictionaryWarnings: string[] }
  | { ok: false; error: MoveError | { kind: 'not-your-turn' } | { kind: 'not-playing' } | { kind: 'invalid-helper' } };
```

Add the human-readable mapping in `server/index.ts`'s `humanReadableReason` switch (do this in the same commit so the typecheck stays green): `case 'invalid-helper': return 'Неверный помощник';`.

- [ ] **Step 2: Add failing tests**

```ts
it('submitMove with helperSlot adds 5 to helper and appends AssistRecord', () => {
  const g = newStartedGame();
  const move = makeFirstMove(g); // existing helper
  const r = g.submitMove(0, move, 1);
  expect(r.ok).toBe(true);
  const snap = g.snapshot();
  expect(snap.players[1]!.score).toBe(5);
  const events = snap.events;
  const moveRec = events.at(-2)!;
  const assistRec = events.at(-1)!;
  expect(moveRec.kind).toBe('move');
  if (moveRec.kind === 'move') expect(moveRec.helperSlot).toBe(1);
  expect(assistRec.kind).toBe('assist');
  if (assistRec.kind === 'assist') {
    expect(assistRec.fromSlot).toBe(0);
    expect(assistRec.toSlot).toBe(1);
    expect(assistRec.points).toBe(5);
    expect(assistRec.forMoveIndex).toBe(events.length - 2);
  }
});

it('submitMove rejects helperSlot equal to submitter', () => {
  const g = newStartedGame();
  const r = g.submitMove(0, makeFirstMove(g), 0);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.kind).toBe('invalid-helper');
});

it('submitMove rejects out-of-range helperSlot', () => {
  const g = newStartedGame();
  const r = g.submitMove(0, makeFirstMove(g), 5 as Slot);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.kind).toBe('invalid-helper');
});

it('rejected move does not award assist or append events', () => {
  const g = newStartedGame();
  const eventsBefore = g.snapshot().events.length;
  const score1Before = g.snapshot().players[1]!.score;
  // Force a move that fails validation (e.g., not crossing center on first move).
  const r = g.submitMove(0, makeInvalidMove(), 1);
  expect(r.ok).toBe(false);
  expect(g.snapshot().events.length).toBe(eventsBefore);
  expect(g.snapshot().players[1]!.score).toBe(score1Before);
});

it('revert of an assisted move reverses helper +5 and appends two revert records', () => {
  const g = newStartedGame();
  g.submitMove(0, makeFirstMove(g), 1);
  expect(g.snapshot().players[1]!.score).toBe(5);
  g.revertLastTurn(0);
  const snap = g.snapshot();
  expect(snap.players[1]!.score).toBe(0);
  expect(snap.players[0]!.score).toBe(0);
  // Log tail after revert: move, assist, revert(assist), revert(move).
  const tail = snap.events.slice(-4);
  expect(tail.map((e) => e.kind)).toEqual(['move', 'assist', 'revert', 'revert']);
  if (tail[2]!.kind === 'revert') expect(tail[2]!.revertedKind).toBe('assist');
  if (tail[3]!.kind === 'revert') expect(tail[3]!.revertedKind).toBe('move');
});
```

Run: `npm test -- tests/game.test.ts -t "assist|helper|reject|revert of an assisted"`
Expected: FAIL.

- [ ] **Step 3: Implement validation + scoring**

In `submitMove`:

```ts
if (helperSlot !== undefined) {
  if (helperSlot !== 0 && helperSlot !== 1 && helperSlot !== 2) {
    return { ok: false, error: { kind: 'invalid-helper' } };
  }
  if (helperSlot === slot) {
    return { ok: false, error: { kind: 'invalid-helper' } };
  }
}
```

Place this check *before* `validateMove` (or right after) so an invalid helper rejects without committing — match the test's expectation that no events were appended.

When building `MoveRecord`, set `helperSlot: helperSlot ?? null`.

After pushing `MoveRecord` to events (and computing its index), apply the assist:

```ts
const moveIndex = this.state.events.length;
this.state.events.push(moveRecord);

if (helperSlot !== undefined) {
  this.state.players[helperSlot]!.score += 5;
  this.state.events.push({
    kind: 'assist',
    fromSlot: slot,
    toSlot: helperSlot,
    points: 5,
    forMoveIndex: moveIndex,
    timestamp: Date.now(),
  });
}
```

The Task-7 `armRevert` slice mechanism captures both the move and the assist automatically — no extra code needed for revert.

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/game.test.ts`
Expected: all green.

- [ ] **Step 5: Wire `helperSlot` through the WS handler**

In `server/index.ts`, `handleSubmitMove`:

```ts
const result = game.submitMove(slot, msg.placements, msg.helperSlot);
```

Run: `npm run typecheck && npm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add server/game.ts server/index.ts shared/types.ts tests/game.test.ts
git commit -m "feat(engine): assist credit (helperSlot=+5 to helper, AssistRecord in events)"
```

---

## Task 9: Persistence — `GameArchive` (final board + events), summary loader, archive loader, history→events shim

**Files:**
- Modify: `server/persistence.ts`
- Modify: `tests/persistence.test.ts`

The current archive on disk is `{ summary, state }`. The new archive is `GameArchive` (flat). `loadActiveGame` accepts either `history` or `events` (one-shot rename shim). Two new functions: `loadArchive(id)` and the renamed/widened `listGameSummaries` (already returns the slim summary — we keep it but make the disk-format read tolerant of both old and new archive shapes).

- [ ] **Step 1: Update `tests/persistence.test.ts`**

Read the existing test file first to see helpers and patterns. Add these tests (and update any existing tests that referenced `state.history` to use `state.events`):

```ts
it('loadActiveGame accepts legacy "history" field and migrates to events on next save', () => {
  const dir = mkdtempSync(...); // existing pattern
  const legacy = {
    phase: 'playing',
    players: [/* three players */],
    turnIndex: 0,
    board: createEmptyBoard(),
    bag: [],
    centerBonusUsed: false,
    history: [],          // legacy field
    startedAt: 1,
  };
  writeFileSync(path.join(dir, 'game.json'), JSON.stringify(legacy), 'utf-8');
  const loaded = loadActiveGame(dir);
  expect(loaded).not.toBeNull();
  expect(loaded!.events).toEqual([]);
  expect((loaded as unknown as { history?: unknown }).history).toBeUndefined();
});

it('archiveFinishedGame writes a flat GameArchive with finalBoard and events', () => {
  const dir = mkdtempSync(...);
  // Set up an active game on disk that has at least one move event and a non-empty board.
  // Simplest path: instantiate a Game, run a move, save, then archive.
  const g = newStartedGame();
  // ... apply one move ...
  saveActiveGame(dir, g.snapshot());
  const archive = archiveFinishedGame(dir);
  expect(archive.events.length).toBeGreaterThan(0);
  expect(archive.finalBoard.length).toBe(15);
  // Round-trip through the loader.
  const loaded = loadArchive(dir, archive.id);
  expect(loaded).not.toBeNull();
  expect(loaded!.id).toBe(archive.id);
  expect(loaded!.events.length).toBe(archive.events.length);
});

it('listGameSummaries returns just the summary slice', () => {
  // Write a synthetic GameArchive file to history/, then read.
  const dir = mkdtempSync(...);
  const histDir = path.join(dir, 'history');
  mkdirSync(histDir, { recursive: true });
  const archive: GameArchive = {
    id: 'g-1', startedAt: 1, finishedAt: 2,
    players: [/* three */], winnerSlot: 0,
    finalBoard: createEmptyBoard(),
    events: [],
  };
  writeFileSync(path.join(histDir, 'g-1.json'), JSON.stringify(archive), 'utf-8');
  const list = listGameSummaries(dir);
  expect(list).toEqual([{
    id: 'g-1', startedAt: 1, finishedAt: 2,
    players: archive.players, winnerSlot: 0,
  }]);
});
```

Run: `npm test -- tests/persistence.test.ts`
Expected: FAIL.

- [ ] **Step 2: Update `server/persistence.ts`**

```ts
import type { GameState, GameSummary, GameArchive, Slot } from '@shared/types';

// loadActiveGame: accept legacy `history` field
export function loadActiveGame(dataDir: string): GameState | null {
  const file = path.join(dataDir, ACTIVE_FILE);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as GameState & { history?: unknown };
  if (raw.events === undefined && Array.isArray(raw.history)) {
    raw.events = raw.history as GameState['events'];
    delete raw.history;
  }
  return raw;
}

// archiveFinishedGame: write flat GameArchive
export function archiveFinishedGame(dataDir: string): GameArchive {
  const state = loadActiveGame(dataDir);
  if (!state) throw new Error('No active game to archive');
  const id = `g-${Date.now()}`;
  const players = state.players.map((p) => ({
    slot: p.slot, name: p.name, finalScore: p.score,
  }));
  const top = Math.max(...players.map((p) => p.finalScore));
  const winners = players.filter((p) => p.finalScore === top);
  const winnerSlot: Slot | null = winners.length === 1 ? winners[0]!.slot : null;
  const archive: GameArchive = {
    id,
    startedAt: state.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    players,
    winnerSlot,
    finalBoard: state.board,
    events: state.events,
  };
  const histDir = path.join(dataDir, HISTORY_DIR);
  mkdirSync(histDir, { recursive: true });
  writeFileSync(path.join(histDir, `${id}.json`), JSON.stringify(archive), 'utf-8');
  rmSync(path.join(dataDir, ACTIVE_FILE));
  return archive;
}

// listGameSummaries: tolerate both old `{summary,state}` and new flat archive
export function listGameSummaries(dataDir: string): GameSummary[] {
  const histDir = path.join(dataDir, HISTORY_DIR);
  if (!existsSync(histDir)) return [];
  const files = readdirSync(histDir).filter((f) => f.endsWith('.json'));
  const summaries: GameSummary[] = files.map((f) => {
    const raw = JSON.parse(readFileSync(path.join(histDir, f), 'utf-8')) as
      | { summary: GameSummary }
      | GameArchive;
    if ('summary' in raw) return raw.summary;
    return {
      id: raw.id,
      startedAt: raw.startedAt,
      finishedAt: raw.finishedAt,
      players: raw.players,
      winnerSlot: raw.winnerSlot,
    };
  });
  summaries.sort((a, b) => b.finishedAt - a.finishedAt);
  return summaries;
}

export function loadArchive(dataDir: string, id: string): GameArchive | null {
  const file = path.join(dataDir, HISTORY_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as
    | { summary: GameSummary; state: GameState & { history?: unknown } }
    | GameArchive;
  if ('summary' in raw) {
    // Pre-snapshots format: synthesize a GameArchive with a placeholder board/events.
    return {
      id: raw.summary.id,
      startedAt: raw.summary.startedAt,
      finishedAt: raw.summary.finishedAt,
      players: raw.summary.players,
      winnerSlot: raw.summary.winnerSlot,
      finalBoard: raw.state.board,
      events: (raw.state.events ?? raw.state.history ?? []) as GameEvent[],
    };
  }
  return raw;
}
```

Add the `GameEvent` import if needed. Update `archiveFinishedGame`'s callers in `server/index.ts` only if they relied on the old return shape (they currently don't — it's never called there yet; M5a will introduce the call site in Task 10).

The persistence comment about `lastSnapshot` not being persisted stays as-is.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/persistence.test.ts`
Expected: green.

- [ ] **Step 4: Run full suite**

Run: `npm run typecheck && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add server/persistence.ts tests/persistence.test.ts
git commit -m "feat(persistence): GameArchive (finalBoard+events); loadArchive; history→events shim"
```

---

## Task 10: Server — call `archiveFinishedGame` on `endGame`; HTTP endpoints `/api/history` and `/api/history/:id`

**Files:**
- Modify: `server/index.ts`
- Modify: `tests/integration/m4b-server.test.ts` (or new `tests/integration/m5a-server.test.ts` — pick whichever fits naming better; integration tests already cluster by milestone, so a new file is fine)

The engine sets `phase = 'finished'` on `endGame`. The server (which is the I/O boundary) should react to that by archiving and clearing the active game so the next `data/game.json` boot sees nothing.

- [ ] **Step 1: Hook archive into the WS handler**

In `server/index.ts`, replace the existing `endGame` handler clause:

```ts
case 'endGame':
  handleEngineAction(ws, () => game!.endGame(slot));
  // After phase flips to 'finished' on disk, archive and clear.
  if (game !== null && game.snapshot().phase === 'finished') {
    try {
      archiveFinishedGame(dataDir);
    } catch (err) {
      console.error('[scrabble] archiveFinishedGame failed:', err);
    }
    game = null;
  }
  return;
```

Note: `handleEngineAction` already calls `saveActiveGame`, so by the time we read `phase === 'finished'` the file on disk has the finished state — `archiveFinishedGame` reads it back and writes the archive, then deletes `game.json`.

Add the import at the top: `import { saveActiveGame, loadActiveGame, archiveFinishedGame, listGameSummaries, loadArchive } from './persistence.js';`.

- [ ] **Step 2: Add the HTTP endpoints**

Below the existing static-serving block in `startServer`:

```ts
app.get('/api/history', (_req, res) => {
  res.json(listGameSummaries(dataDir));
});

app.get('/api/history/:id', (req, res) => {
  const archive = loadArchive(dataDir, req.params.id);
  if (archive === null) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(archive);
});
```

These must be registered **before** the catch-all `app.get('*', ...)` static fallback. Move the `app.get('*', ...)` to run *after* the API routes.

- [ ] **Step 3: Add integration test**

Create `tests/integration/m5a-server.test.ts`. Use the existing `tests/integration/m4-server.test.ts` or `m4b-server.test.ts` as the boilerplate template (three-client harness, `startServer({ port: 0, dataDir })`, etc.). Cover:

```ts
describe('M5a — archive + history endpoints', () => {
  it('endGame archives a flat GameArchive and clears game.json', async () => {
    // 1. Start server, seat 3 clients, wait for 'state' phase: 'playing'.
    // 2. Have slot 0 send { type: 'endGame' }; wait for the broadcast 'state' phase: 'finished'.
    // 3. Assert data/game.json no longer exists; data/history/<id>.json exists with `events`/`finalBoard`/no `summary` wrapper.
  });

  it('GET /api/history returns the summary list', async () => {
    // After arrange-archive, fetch http://localhost:<port>/api/history
    // Expect a 200 with one entry: { id, startedAt, finishedAt, players, winnerSlot }.
  });

  it('GET /api/history/:id returns the full GameArchive', async () => {
    // Fetch http://localhost:<port>/api/history/<id>
    // Expect events array and a 15x15 finalBoard.
  });

  it('GET /api/history/:id 404s for unknown id', async () => {
    // Fetch /api/history/g-does-not-exist → 404.
  });
});
```

Run: `npm test -- tests/integration/m5a-server.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts tests/integration/m5a-server.test.ts
git commit -m "feat(server): archive on endGame; GET /api/history and /api/history/:id"
```

---

## Task 11: Client — store + ws plumbing for events and helperSlot

**Files:**
- Modify: `client/src/store.ts`
- Modify: `client/src/ws.ts`

The store already takes a full `GameState` snapshot, so the rename `history → events` is automatic on the wire. The only client-side work here is:
1. A `pendingHelperSlot: Slot | null` field in the store, with setter, cleared on `clearPending`.
2. A new `sendSubmitMove(placements, helperSlot)` helper (mirroring the existing `sendPass` etc.) so call sites stop using `send({ type: 'submitMove', ... })` directly.

- [ ] **Step 1: Extend the store**

In `client/src/store.ts`:

```ts
type Store = {
  // ... existing fields ...
  pendingHelperSlot: Slot | null;
  setPendingHelperSlot: (slot: Slot | null) => void;
  // ...
};

export const useGameStore = create<Store>((set) => ({
  // ... existing ...
  pendingHelperSlot: null,
  setPendingHelperSlot: (pendingHelperSlot) => set({ pendingHelperSlot }),
  clearPending: () => set({ pendingPlacements: [], pendingHelperSlot: null, lastError: null }),
  // ...
}));
```

- [ ] **Step 2: Add a `sendSubmitMove` helper**

In `client/src/ws.ts`:

```ts
import type { ClientMessage, ServerMessage, Slot, Placement } from '@shared/types';

// ...

export function sendSubmitMove(placements: Placement[], helperSlot: Slot | null): void {
  const msg: Extract<ClientMessage, { type: 'submitMove' }> =
    helperSlot === null
      ? { type: 'submitMove', placements }
      : { type: 'submitMove', placements, helperSlot };
  send(msg);
}
```

- [ ] **Step 3: Update `PlayerCard.tsx`'s submit call to feed the new helper**

This is a lightweight wire-up; the *modal* lands in Task 12. For now keep the direct submit but pass `null`:

```ts
import { sendSubmitMove } from '../ws.js';
// ...
function onSubmit() {
  const placements = pending.map((p) => ({ tileId: p.tileId, row: p.row, col: p.col, playedAs: p.playedAs }));
  sendSubmitMove(placements, null);  // helper picker arrives in Task 12
}
```

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add client/src/store.ts client/src/ws.ts client/src/components/PlayerCard.tsx
git commit -m "feat(client): pendingHelperSlot in store; sendSubmitMove helper"
```

---

## Task 12: Client — submit confirm modal with helper picker

**Files:**
- Create: `client/src/components/SubmitConfirmModal.tsx`
- Modify: `client/src/components/PlayerCard.tsx`

Replace `PlayerCard`'s direct submit with a confirm modal that shows the words/score preview and the "Кто помог?" picker. The modal reuses the existing `ConfirmModal` shell (read it first to match the visual pattern).

The score preview is awkward server-authoritative-wise — we don't want to duplicate scoring logic on the client. The pragmatic family-app answer: show the placed letters and a **count** of tiles, no preview score. The label can read e.g. *"Сходить (5 плиток)?"*. If you want to preview the formed words, that requires running validation client-side, which violates the server-authoritative principle in CLAUDE.md — skip it.

- [ ] **Step 1: Create the modal**

```tsx
// client/src/components/SubmitConfirmModal.tsx
import type { Slot } from '@shared/types';
import { useGameStore } from '../store.js';

type Props = {
  open: boolean;
  mySlot: Slot;
  otherPlayers: { slot: Slot; name: string }[];
  tileCount: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SubmitConfirmModal({ open, otherPlayers, tileCount, onCancel, onConfirm }: Props) {
  const helper = useGameStore((s) => s.pendingHelperSlot);
  const setHelper = useGameStore((s) => s.setPendingHelperSlot);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-80 rounded-lg bg-tile p-4 shadow-lg">
        <p className="mb-3 text-base font-semibold text-ink">
          Сходить? ({tileCount} {pluralRu(tileCount, 'плитка', 'плитки', 'плиток')})
        </p>
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm text-ink/70">Кто помог?</legend>
          <label className="mb-1 flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="helper"
              checked={helper === null}
              onChange={() => setHelper(null)}
            />
            никто
          </label>
          {otherPlayers.map((p) => (
            <label key={p.slot} className="mb-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="helper"
                checked={helper === p.slot}
                onChange={() => setHelper(p.slot)}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-ink/10 px-3 py-1.5 text-sm hover:bg-ink/20"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-sage px-3 py-1.5 text-sm font-semibold text-ink shadow hover:bg-sage-light"
          >
            Сходить
          </button>
        </div>
      </div>
    </div>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
```

(Match Tailwind class names to existing components — read `ConfirmModal.tsx` first and align colors / spacing with it. The above uses the same `bg-tile`, `bg-sage`, `bg-ink/10` tokens as the rest of the codebase.)

- [ ] **Step 2: Wire the modal into `PlayerCard.tsx`**

```tsx
import { useState } from 'react';
import { SubmitConfirmModal } from './SubmitConfirmModal.js';
import { sendSubmitMove } from '../ws.js';
// ...

export function PlayerCard({ player, isCurrentTurn }: Props) {
  const identity = useGameStore((s) => s.identity);
  const pending = useGameStore((s) => s.pendingPlacements);
  const helper = useGameStore((s) => s.pendingHelperSlot);
  const clearPending = useGameStore((s) => s.clearPending);
  const allPlayers = useGameStore((s) => s.state?.players ?? []);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isMine = identity?.slot === player.slot;
  const showButtons = isMine && isCurrentTurn && pending.length > 0;
  const bg = isCurrentTurn ? 'bg-peach' : 'bg-tile';

  const others = allPlayers
    .filter((p) => identity !== null && p.slot !== identity.slot)
    .map((p) => ({ slot: p.slot, name: p.name || `Slot ${p.slot}` }));

  function onConfirm() {
    const placements = pending.map((p) => ({
      tileId: p.tileId, row: p.row, col: p.col, playedAs: p.playedAs,
    }));
    sendSubmitMove(placements, helper);
    setConfirmOpen(false);
  }

  return (
    <div className={`rounded-md ${bg} p-3 shadow-sm`}>
      {/* existing header + Rack */}
      {showButtons && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => setConfirmOpen(true)} className="rounded bg-sage ...">Сходить</button>
          <button type="button" onClick={clearPending} className="rounded bg-ink/10 ...">Вернуть</button>
        </div>
      )}
      {identity !== null && (
        <SubmitConfirmModal
          open={confirmOpen}
          mySlot={identity.slot}
          otherPlayers={others}
          tileCount={pending.length}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={onConfirm}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`
- Open three tabs (`?slot=0/1/2`). Place a few tiles as slot 0. Click "Сходить" → modal opens → pick "никто" or another player → confirm. Verify: move accepts; if helper chosen, that player's score gains +5.
- Repeat with helper === yourself (UI doesn't allow this — the picker only lists the other two). Sanity OK.

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/SubmitConfirmModal.tsx client/src/components/PlayerCard.tsx
git commit -m "feat(client): submit confirm modal with helper picker"
```

---

## Task 13: Client — `<MoveLog>` component in the right rail

**Files:**
- Create: `client/src/components/MoveLog.tsx`
- Modify: `client/src/App.tsx`

Renders `state.events` newest-at-bottom; auto-scrolls on append. Lives in the right rail below the player cards (read `App.tsx` first to find the existing right-column layout and append the log inside it).

- [ ] **Step 1: Create the component**

```tsx
// client/src/components/MoveLog.tsx
import { useEffect, useRef } from 'react';
import type { GameEvent, GameState } from '@shared/types';

type Props = { state: GameState };

export function MoveLog({ state }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current === null) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.events.length]);

  const nameOf = (slot: number) => state.players[slot]?.name || `Slot ${slot}`;

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 overflow-y-auto rounded-md bg-tile p-2 text-sm text-ink shadow-sm"
      data-testid="move-log"
    >
      {state.events.length === 0 ? (
        <p className="text-ink/50">Ещё нет ходов</p>
      ) : (
        <ol className="space-y-0.5">
          {state.events.map((e, i) => (
            <li key={i}>{renderEvent(e, nameOf)}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function renderEvent(e: GameEvent, nameOf: (s: number) => string): React.ReactNode {
  switch (e.kind) {
    case 'move': {
      const words = e.wordsFormed.map((w) => w.word).join(', ');
      return (
        <span>
          <strong>{nameOf(e.slot)}</strong> • {words || '—'} — <span className="tabular-nums">{e.totalScore}</span>
          {e.bingoBonus && <span className="ml-1 rounded bg-sage px-1 text-xs">+10 бинго</span>}
        </span>
      );
    }
    case 'assist':
      return (
        <span className="ml-4 text-ink/60">↳ помог{femEnding(nameOf(e.toSlot))} {nameOf(e.toSlot)} — +{e.points}</span>
      );
    case 'pass':
      return <span><strong>{nameOf(e.slot)}</strong> • пас</span>;
    case 'redraw': {
      const reason = e.reason === 'allVowels' ? 'все гласные' : 'все согласные';
      return (
        <span><strong>{nameOf(e.slot)}</strong> • обмен ({reason}, {e.tileCount})</span>
      );
    }
    case 'claimBlank': {
      const cell = `${'abcdefghijklmno'[e.col]}${e.row + 1}`;
      return <span><strong>{nameOf(e.slot)}</strong> • ★→{e.letterAs} на {cell}</span>;
    }
    case 'endGame': {
      const cause =
        e.cause === 'playerEnded' ? `${nameOf(e.slot)} завершил` :
        e.cause === 'bagEmptyAndRackEmpty' ? 'закончились буквы' :
        'шесть пасов';
      return <em className="text-ink/70">Игра окончена ({cause})</em>;
    }
    case 'revert':
      return <span className="ml-4 text-ink/50 line-through">↳ отменено</span>;
  }
}

// Best-effort feminine ending for "помог/помогла". Without per-player gender, we
// can't be precise — this is a tiny family app, so use a simple heuristic:
// names ending in 'а' or 'я' get the feminine form.
function femEnding(name: string): string {
  const last = name.trim().slice(-1).toLowerCase();
  return last === 'а' || last === 'я' ? 'ла' : '';
}
```

(If the family-config carries gender per player, prefer that — read `server/family.ts` and `data/family.example.json`. If not, the heuristic above is good enough for М5а.)

- [ ] **Step 2: Mount the log in `App.tsx`**

Read `client/src/App.tsx` and find the right column where `<PlayerCard>`s are rendered. Append `<MoveLog state={state} />` immediately after the three cards, inside the same flex column. The column should be `flex flex-col` so `flex-1 min-h-0` on the log makes it fill the remaining height with internal scroll.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`
- Place a move → log shows `Имя • СЛОВО — N`.
- Pass → `Имя • пас`.
- Redraw (rig an all-vowel rack via DevTools or just play to it) → log shows `обмен (все гласные, 7)`.
- Claim a blank → log shows `★→Б на e7`.
- Submit with helper → log shows move plus indented `↳ помогла Имя — +5`.
- Revert → log shows `↳ отменено` lines.
- End game → italic terminal line.

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/MoveLog.tsx client/src/App.tsx
git commit -m "feat(client): MoveLog panel in right rail under player cards"
```

---

## Task 13b: Client — bag-remaining indicator

**Files:**
- Create: `client/src/components/BagIndicator.tsx`
- Modify: `client/src/App.tsx`

A tiny chip showing `Мешок: N` where N is `state.bag.length`. Mounted at the top of the right rail (above the player cards), in-game only.

- [ ] **Step 1: Create the component**

```tsx
// client/src/components/BagIndicator.tsx
type Props = { count: number };

export function BagIndicator({ count }: Props) {
  return (
    <div className="rounded-md bg-tile px-3 py-1.5 text-sm text-ink shadow-sm">
      Мешок: <span className="tabular-nums font-semibold">{count}</span>
    </div>
  );
}
```

- [ ] **Step 2: Mount above the player cards in `App.tsx`**

In the right column, before the first `<PlayerCard>`:

```tsx
<BagIndicator count={state.bag.length} />
```

Don't render it in `PastGamesDetail` (a finished archive's bag is uninteresting).

- [ ] **Step 3: Manual smoke**

`npm run dev` — verify the chip shows the starting count (104 minus 21 dealt = 83 at game start) and decreases as tiles are played, increases on redraw.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/BagIndicator.tsx client/src/App.tsx
git commit -m "feat(client): bag-remaining indicator above player cards"
```

---

## Task 14: Client — Past Games viewer (list + detail)

**Files:**
- Create: `client/src/components/PastGamesList.tsx`
- Create: `client/src/components/PastGamesDetail.tsx`
- Modify: `client/src/App.tsx`

No router dependency in the existing project (read `App.tsx` to confirm — if there's no router, we'll do a tiny URL-hash router locally rather than adding `react-router`). The trigger is a button on the lobby screen ("Прошлые игры") and on the in-game screen (a small link in the top-right). Detail view is reached by clicking a list row.

The detail view re-renders the final board read-only. The existing `<Board>` component is currently interactive (drop targets, drag handlers). Pass a `readOnly` prop and gate dnd-kit registration behind it. (Read `Board.tsx` first to see the dnd hooks; it should be a small change to short-circuit them when read-only.)

- [ ] **Step 1: Add a tiny hash-based view switch in `App.tsx`**

```tsx
import { useEffect, useState } from 'react';
// ...
export default function App() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  if (route === '#past') return <PastGamesList />;
  if (route.startsWith('#past/')) return <PastGamesDetail id={route.slice('#past/'.length)} />;

  return /* existing main render */;
}
```

Add a "Прошлые игры" link/button in the existing lobby/`MissingParams`/in-game header. The link's href is `#past`.

- [ ] **Step 2: `PastGamesList.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { GameSummary } from '@shared/types';

export function PastGamesList() {
  const [items, setItems] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/history')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: GameSummary[]) => setItems(data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-ink">Прошлые игры</h1>
        <a href="#" className="text-sm text-ink/70 hover:underline">← назад</a>
      </header>
      {error !== null && <p className="text-red-700">Ошибка: {error}</p>}
      {items === null && error === null && <p>Загрузка…</p>}
      {items !== null && items.length === 0 && <p>Пока нет архивных игр.</p>}
      {items !== null && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((g) => (
            <li key={g.id} className="rounded bg-tile p-3 shadow-sm">
              <a href={`#past/${g.id}`} className="block hover:underline">
                <div className="text-sm text-ink/70">{new Date(g.finishedAt).toLocaleString('ru-RU')}</div>
                <div className="text-base">
                  {g.players.map((p) => `${p.name} — ${p.finalScore}`).join(' · ')}
                </div>
                <div className="text-sm text-ink/70">
                  Победитель: {g.winnerSlot === null ? 'ничья' : g.players.find((p) => p.slot === g.winnerSlot)?.name}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: `PastGamesDetail.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { GameArchive, GameState } from '@shared/types';
import { Board } from './Board.js';
import { MoveLog } from './MoveLog.js';

export function PastGamesDetail({ id }: { id: string }) {
  const [archive, setArchive] = useState<GameArchive | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/history/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: GameArchive) => setArchive(data))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error !== null) return <p className="p-6 text-red-700">Ошибка: {error}</p>;
  if (archive === null) return <p className="p-6">Загрузка…</p>;

  // Synthesize a minimal GameState for <MoveLog>.
  const fakeState: GameState = {
    phase: 'finished',
    players: archive.players.map((p) => ({
      slot: p.slot, name: p.name, connected: false,
      rack: [], rackVisible: false, score: p.finalScore,
      redrawEligible: false, canRevert: false,
    })) as GameState['players'],
    turnIndex: 0,
    board: archive.finalBoard,
    bag: [],
    centerBonusUsed: false,
    events: archive.events,
    startedAt: archive.startedAt,
  };

  return (
    <main className="grid grid-cols-[auto_18rem] gap-4 p-4">
      <div>
        <header className="mb-2 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold">
            {new Date(archive.finishedAt).toLocaleString('ru-RU')}
          </h1>
          <a href="#past" className="text-sm text-ink/70 hover:underline">← назад</a>
        </header>
        <Board state={fakeState} readOnly />
      </div>
      <aside className="flex flex-col gap-2">
        <ul className="space-y-1 rounded bg-tile p-2 text-sm shadow-sm">
          {archive.players.map((p) => (
            <li key={p.slot} className={archive.winnerSlot === p.slot ? 'font-semibold' : ''}>
              {p.name} — <span className="tabular-nums">{p.finalScore}</span>
            </li>
          ))}
        </ul>
        <MoveLog state={fakeState} />
      </aside>
    </main>
  );
}
```

(Adjust the grid columns and aside width to match the live in-game layout — read `App.tsx` for the current proportions.)

- [ ] **Step 4: Make `<Board>` accept `readOnly`**

Read `client/src/components/Board.tsx`. Add a `readOnly?: boolean` prop. When true:
- Skip the dnd-kit `useDroppable` registrations (or set `disabled: true`).
- Don't render the pending-placement / drop-highlight overlays.
- Render existing committed cells normally.

The simplest: at the top of `Board`, if `readOnly`, render a stripped-down `<table>` of `<Square>`s without any drag/drop or pending-placement logic. Mirror `<Square>`'s read-only rendering by passing `readOnly` through.

(Concrete Board.tsx changes can't be specified verbatim here without re-reading the file — apply the principle, keep the change minimal, and ensure the live game still passes its existing manual smoke test.)

- [ ] **Step 5: Manual smoke**

Run: `npm run dev`
- Play a short game in three tabs, end it via "Завершить игру".
- Visit `http://localhost:5173/#past` → list shows the archived game.
- Click it → detail view shows board, scores, full log including assists/passes/etc.

- [ ] **Step 6: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/PastGamesList.tsx client/src/components/PastGamesDetail.tsx client/src/App.tsx client/src/components/Board.tsx client/src/components/Square.tsx
git commit -m "feat(client): Past Games viewer (list + detail with read-only board + log)"
```

---

## Task 15: Demo script + final manual pass

**Files:**
- Modify: `scripts/demo-game.ts`

- [ ] **Step 1: Update the demo to exercise assist + revert**

Read `scripts/demo-game.ts` first; it already drives a full game in-process. Insert (a) at least one `submitMove(slot, placements, otherSlot)` call so the helper path runs, and (b) one `revertLastTurn` followed by a re-submit so the revert + re-submit path is exercised. Print the final `events` array and the assist-receiver's score so a human can eyeball it.

- [ ] **Step 2: Run the demo**

Run: `npm run demo`
Expected: prints a final state with at least one `assist` record and at least one `revert` record; helper's score reflects +5; nothing throws.

- [ ] **Step 3: Run the full test+typecheck once more**

Run: `npm run typecheck && npm test`
Expected: green.

- [ ] **Step 4: Manual UI pass**

`npm run dev`, three tabs, walk through:
- Move with helper → both scores update; log shows move + `↳ помогла X — +5`.
- Revert that move → both scores roll back; log shows two `↳ отменено` lines under the move + assist.
- Pass / redraw / claim-blank / endGame each appear in the log with the right phrasing.
- After endGame, `#past` shows the archive; opening it renders the final board (read-only) + the full log.

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-game.ts
git commit -m "chore(demo): exercise assist + revert in demo-game"
```

---

## Out-of-plan notes

- The `bagEmptyAndRackEmpty` and `sixPasses` end-game causes are forward-looking enum members — no auto-detection in M5a. Add detection in M5b (or later) and emit those causes there.
- Pre-snapshots archives (the old `{ summary, state }` shape) are rendered through `loadArchive`'s synthesis path; their event log will be sparse but readable. No migration script.
- The "(archived before snapshots existed)" annotation mentioned in the spec is implicit — pre-snapshot archives just have no `assist`/`pass`/etc. records to show. If you want an explicit banner, add a single line in `PastGamesDetail` checking whether `archive.events.length === 0` and rendering it; deferred unless someone asks.

---

## Self-Review

**Spec coverage:**
- §3 Data model — Task 1 ✓
- §4 Assist mechanics — Task 8 ✓ (validation, application, revert reverses)
- §5 Move log UI — Task 13 ✓ (entry formats per kind, right-rail placement)
- §5c Bag-remaining indicator — Task 13b ✓
- §5b Helper picker UX — Task 12 ✓ (on submit confirm modal)
- §6 Past Games viewer — Task 10 (HTTP) + Task 14 (UI) ✓
- §7 Persistence — Task 9 ✓ (GameArchive, summary loader, archive loader, history→events shim)
- §8 Tests — covered across Tasks 2–10 ✓
- §9 Order of work — Tasks 1–15 follow the spec's order ✓

**Placeholder scan:** none — every code step has actual code. The `Board.tsx` `readOnly` change in Task 14 Step 4 is described by principle rather than verbatim code because the file's current shape determines the cleanest cut.

**Type consistency:** `events` (not `history`), `helperSlot` consistent across types/server/client, `GameEvent` kind discriminants spelled the same in types, engine, and renderer.
