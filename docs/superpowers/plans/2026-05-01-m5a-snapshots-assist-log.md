# M5 Additions — Snapshots, Assist Credit, Move Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three M5 features: (1) "мама помогла" assist credit (+5 to a helper, attached to a `submitMove`); (2) live move log panel + same log embedded in archived games; (3) finished-game snapshots (full board + complete event log) plus an in-app Past Games viewer.

**Architecture:** Extend `GameState.history` (a `MoveRecord[]`) into `GameState.events` (a `GameEvent[]` discriminated union of `MoveRecord | AssistRecord`). Server applies assist atomically inside `submitMove`. Persistence already stores `{summary, state}` per archived game, so snapshots come almost free — we just rename the wrapper to `GameArchive`, add an `events` projection helper, and expose two HTTP endpoints (`/api/history`, `/api/history/:id`). Client gains a `<MoveLog>` panel, a helper picker on the submit row, and a `/past` route with list + detail views.

**Tech Stack:** TypeScript strict, Node 20, Vitest, Express + ws, React 19, Zustand, Tailwind 4, Vite. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-05-01-m5a-snapshots-assist-log-design.md`.

> **NOTE — plan refresh pending.** The spec was amended after this plan was first written: the event union now includes `PassRecord`, `RedrawRecord`, `ClaimBlankRecord`, `EndGameRecord`, and `RevertRecord` (not just `MoveRecord | AssistRecord`); the helper picker is pinned to the submit confirm modal; the `<MoveLog>` is pinned to the right rail under the player cards; revert reverses an attached assist's +5. Tasks below predate those changes and need to be re-derived. See `docs/superpowers/specs/2026-05-01-m5a-snapshots-assist-log-design.md` for the current source of truth.

**Conventions reminder:**
- `.js` extension on relative imports
- Path aliases `@shared/*`, `@server/*`
- Single quotes, `type` over `interface`, discriminated unions for results
- Vitest: `tests/<module>.test.ts`, `expect(actual).toEqual(expected)`
- Run `npm run typecheck && npm test` before each commit
- No `Co-Authored-By` trailer in commits

---

## Task 1: Type changes — `GameEvent`, `helperSlot`, `GameArchive`

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Update `shared/types.ts`** — add `kind` discriminant + `helperSlot` to `MoveRecord`, introduce `AssistRecord`, `GameEvent`, rename `GameState.history` → `GameState.events` typed as `GameEvent[]`, extend `submitMove` with optional `helperSlot`, replace `GameSummary`-only archive with `GameArchive`.

Replace these definitions:

```ts
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
  forMoveIndex: number;
  timestamp: number;
};

export type GameEvent = MoveRecord | AssistRecord;

export type GamePhase = 'waiting' | 'playing' | 'finished';

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

export type GameSummary = {
  id: string;
  startedAt: number;
  finishedAt: number;
  players: { slot: Slot; name: string; finalScore: number }[];
  winnerSlot: Slot | null;
};

export type GameArchive = GameSummary & {
  finalBoard: Board;
  events: GameEvent[];
};
```

Replace the `submitMove` variant in `ClientMessage`:

```ts
| { type: 'submitMove'; placements: Placement[]; helperSlot?: Slot }
```

- [ ] **Step 2: Run typecheck — failures expected**

Run: `npm run typecheck`
Expected: errors in `server/game.ts` (missing `kind`, references to `state.history`), in `server/persistence.ts` (returns `GameSummary`, references `state.history` indirectly), in `server/index.ts` (broadcasts `state`), in `client/src/store.ts` and components if they touch `state.history`.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): GameEvent union, helperSlot, GameArchive"
```

---

## Task 2: Engine — assist scoring + events rename in `Game`

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts` (existing tests will need `state.history` → `state.events`)
- Test: `tests/assist.test.ts` (new)

- [ ] **Step 1: Write failing tests for assist** in new file `tests/assist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Game } from '@server/game.js';

function setup() {
  const g = new Game({ seed: 42 });
  g.joinPlayer(0, 'A');
  g.joinPlayer(1, 'B');
  g.joinPlayer(2, 'C');
  g.startGame();
  return g;
}

describe('assist credit', () => {
  it('rejects helperSlot equal to submitter', () => {
    const g = setup();
    const slot = g.snapshot().turnIndex;
    const res = g.submitMove(slot, [], { helperSlot: slot });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('invalid-helper');
  });

  it('rejects helperSlot out of range', () => {
    const g = setup();
    const slot = g.snapshot().turnIndex;
    const res = g.submitMove(slot, [], { helperSlot: 5 as 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.kind).toBe('invalid-helper');
  });

  it('does not credit helper when the move itself is rejected', () => {
    const g = setup();
    const slot = g.snapshot().turnIndex;
    const helper: 0 | 1 | 2 = (((slot + 1) % 3) as 0 | 1 | 2);
    const before = g.snapshot().players[helper].score;
    const res = g.submitMove(slot, [], { helperSlot: helper }); // empty = invalid move
    expect(res.ok).toBe(false);
    expect(g.snapshot().players[helper].score).toBe(before);
    expect(g.snapshot().events.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the new tests — verify they fail**

Run: `npx vitest run tests/assist.test.ts`
Expected: FAIL — `submitMove` does not accept a third arg, `state.events` does not exist.

- [ ] **Step 3: Update `server/game.ts`**

Rename `history` → `events`. Extend `submitMove` to take an optional opts arg `{ helperSlot?: Slot }`. Validate helper. After committing the move, push `MoveRecord` (with `kind: 'move'` and `helperSlot`), then if helper is set, bump score and push `AssistRecord`.

Concretely:

```ts
import type { GameState, Player, Slot, Tile, Placement, MoveRecord, WordFormed, AssistRecord } from '@shared/types';
// ... existing imports
import type { MoveError } from './moves.js';

export type SubmitOpts = { helperSlot?: Slot };

export type SubmitResult =
  | { ok: true; moveRecord: MoveRecord; assistRecord: AssistRecord | null; dictionaryWarnings: string[] }
  | { ok: false; error: MoveError | { kind: 'not-your-turn' } | { kind: 'not-playing' } | { kind: 'invalid-helper' } };
```

Constructor: change `history: []` to `events: []`.

`fromState`: no logic change — `cloned` already has the renamed field by virtue of being a fresh `GameState`.

`submitMove(slot, placements, opts: SubmitOpts = {})`:

```ts
const helperSlot = opts.helperSlot;
if (helperSlot !== undefined) {
  if (helperSlot !== 0 && helperSlot !== 1 && helperSlot !== 2) {
    return { ok: false, error: { kind: 'invalid-helper' } };
  }
  if (helperSlot === slot) {
    return { ok: false, error: { kind: 'invalid-helper' } };
  }
}
// ... existing phase / turn / validation checks UNCHANGED
// ... existing placement / scoring / refill logic UNCHANGED
const moveRecord: MoveRecord = {
  kind: 'move',
  slot,
  placements,
  wordsFormed: score.perWord.map<WordFormed>((w) => ({ word: w.word, cells: w.cells, score: w.score })),
  totalScore: score.totalScore,
  bingoBonus: score.bingoBonus,
  helperSlot: helperSlot ?? null,
  timestamp: Date.now(),
};
this.state.events.push(moveRecord);
const moveIndex = this.state.events.length - 1;

let assistRecord: AssistRecord | null = null;
if (helperSlot !== undefined) {
  this.state.players[helperSlot]!.score += 5;
  assistRecord = {
    kind: 'assist',
    fromSlot: slot,
    toSlot: helperSlot,
    points: 5,
    forMoveIndex: moveIndex,
    timestamp: Date.now(),
  };
  this.state.events.push(assistRecord);
}

this.state.turnIndex = ((slot + 1) % 3) as Slot;
const dictionaryWarnings = checkWords(words.map((w) => w.word));
return { ok: true, moveRecord, assistRecord, dictionaryWarnings };
```

Note: helper validation runs **before** phase/turn checks per the test ordering — but actually, the spec says assist is only applied when the move itself is valid. Reorder: check phase, check turn, validate move, THEN validate helper, THEN apply. Adjust the code above so the helper check happens after `validateMove` succeeds. The "rejected move → no credit" test will catch this.

Final correct order in `submitMove`:
1. phase check
2. turn check
3. validate move geometry
4. validate helper (return `invalid-helper` if bad)
5. apply placements, score, refill
6. push MoveRecord
7. apply assist if any

- [ ] **Step 4: Add tests for the happy path** to `tests/assist.test.ts`:

```ts
it('credits helper +5 and pushes AssistRecord referencing the move', () => {
  // Build a game with a known opening word using a deterministic seed/scripted game.
  // Cheapest approach: reuse the demo or scripted-game scaffolding to play one move,
  // by directly placing tiles. Use scripted-game helpers if available; otherwise call
  // submitMove with placements derived from the player's actual rack.
  const g = new Game({ seed: 1 });
  g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
  g.startGame();
  const state = g.snapshot();
  const submitter = state.turnIndex;
  const helper: Slot = (((submitter + 1) % 3) as Slot);
  const helperBefore = state.players[helper].score;

  // Take the first two tiles from submitter's rack and place a horizontal pair on the center.
  const rack = state.players[submitter].rack;
  const placements = [
    { tileId: rack[0]!.id, row: 7, col: 7, playedAs: rack[0]!.letter || 'А' },
    { tileId: rack[1]!.id, row: 7, col: 8, playedAs: rack[1]!.letter || 'А' },
  ];
  const res = g.submitMove(submitter, placements, { helperSlot: helper });
  // The placement may not form a valid word — accept either accepted or rejected,
  // but if accepted, helper score must be +5; if rejected, helper score unchanged.
  const after = g.snapshot();
  if (res.ok) {
    expect(after.players[helper].score).toBe(helperBefore + 5);
    expect(after.events.at(-1)!.kind).toBe('assist');
    const assist = after.events.at(-1) as AssistRecord;
    expect(assist.toSlot).toBe(helper);
    expect(assist.fromSlot).toBe(submitter);
    expect(after.events[assist.forMoveIndex]!.kind).toBe('move');
  } else {
    expect(after.players[helper].score).toBe(helperBefore);
  }
});
```

If this test is too brittle (random rack), drop it and rely on a more scripted test in Task 3 once the demo script is updated. Either keep it or delete it before commit.

- [ ] **Step 5: Sweep `tests/game.test.ts` for `state.history` → `state.events`**

Run: `grep -n "history" tests/game.test.ts`
For each hit, replace with `events` and add `kind: 'move'` expectations where the test inspects record shape.

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: errors only in `server/persistence.ts`, `server/index.ts`, and possibly client (handled in later tasks).

- [ ] **Step 8: Commit**

```bash
git add server/game.ts tests/assist.test.ts tests/game.test.ts
git commit -m "feat(server): assist credit on submitMove, rename history→events"
```

---

## Task 3: Persistence — `GameArchive`, summary loader, archive loader

**Files:**
- Modify: `server/persistence.ts`
- Modify: `tests/persistence.test.ts` (or create if missing — first check `ls tests/`)

- [ ] **Step 1: Write failing tests** in `tests/persistence.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  saveActiveGame,
  loadActiveGame,
  archiveFinishedGame,
  listGameSummaries,
  loadArchive,
} from '@server/persistence.js';
import type { GameState, GameArchive } from '@shared/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    phase: 'finished',
    players: [
      { slot: 0, name: 'A', connected: true, rack: [], rackVisible: true, score: 10 },
      { slot: 1, name: 'B', connected: true, rack: [], rackVisible: true, score: 20 },
      { slot: 2, name: 'C', connected: true, rack: [], rackVisible: true, score: 5 },
    ],
    turnIndex: 0,
    board: Array.from({ length: 15 }, () => Array(15).fill(null)),
    bag: [],
    centerBonusUsed: false,
    events: [],
    startedAt: 1000,
    ...overrides,
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'scrabble-persist-'));
});

describe('persistence — archive', () => {
  it('archiveFinishedGame writes a GameArchive with finalBoard + events', () => {
    const state = makeState();
    saveActiveGame(dir, state);
    const summary = archiveFinishedGame(dir);
    expect(summary.players[1]!.finalScore).toBe(20);
    expect(summary.winnerSlot).toBe(1);

    const archive = loadArchive(dir, summary.id);
    expect(archive).not.toBeNull();
    expect(archive!.id).toBe(summary.id);
    expect(archive!.finalBoard.length).toBe(15);
    expect(archive!.events).toEqual([]);
  });

  it('listGameSummaries returns just the summary slice (not full state)', () => {
    saveActiveGame(dir, makeState());
    archiveFinishedGame(dir);
    const list = listGameSummaries(dir);
    expect(list.length).toBe(1);
    const entry = list[0]!;
    expect(entry).toHaveProperty('winnerSlot');
    expect(entry).not.toHaveProperty('finalBoard');
    expect(entry).not.toHaveProperty('events');
  });

  it('loadActiveGame accepts legacy `history` field and rewrites as `events`', () => {
    const state = makeState();
    // Hand-write a legacy file with `history` instead of `events`.
    const legacy = { ...state, history: [], events: undefined };
    delete (legacy as { events?: unknown }).events;
    const fs = require('node:fs');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'game.json'), JSON.stringify(legacy));

    const loaded = loadActiveGame(dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify failures**

Run: `npx vitest run tests/persistence.test.ts`
Expected: FAIL — `loadArchive` not exported, summary still includes the full state under a `state` field, legacy load doesn't translate.

- [ ] **Step 3: Rewrite `server/persistence.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { GameState, GameSummary, GameArchive, Slot } from '@shared/types';

const ACTIVE_FILE = 'game.json';
const HISTORY_DIR = 'history';

export function saveActiveGame(dataDir: string, state: GameState): void {
  mkdirSync(dataDir, { recursive: true });
  const final = path.join(dataDir, ACTIVE_FILE);
  const tmp = `${final}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), 'utf-8');
  renameSync(tmp, final);
}

export function loadActiveGame(dataDir: string): GameState | null {
  const file = path.join(dataDir, ACTIVE_FILE);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as GameState & { history?: unknown };
  if (raw.events === undefined && Array.isArray(raw.history)) {
    raw.events = raw.history as GameState['events'];
    delete raw.history;
    saveActiveGame(dataDir, raw);
  }
  return raw;
}

function summarize(state: GameState, id: string): GameSummary {
  const players = state.players.map((p) => ({ slot: p.slot, name: p.name, finalScore: p.score }));
  const top = Math.max(...players.map((p) => p.finalScore));
  const winners = players.filter((p) => p.finalScore === top);
  const winnerSlot: Slot | null = winners.length === 1 ? winners[0]!.slot : null;
  return {
    id,
    startedAt: state.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    players,
    winnerSlot,
  };
}

export function archiveFinishedGame(dataDir: string): GameSummary {
  const state = loadActiveGame(dataDir);
  if (!state) throw new Error('No active game to archive');
  const id = `g-${Date.now()}`;
  const summary = summarize(state, id);
  const archive: GameArchive = {
    ...summary,
    finalBoard: state.board,
    events: state.events,
  };
  const histDir = path.join(dataDir, HISTORY_DIR);
  mkdirSync(histDir, { recursive: true });
  writeFileSync(path.join(histDir, `${id}.json`), JSON.stringify(archive), 'utf-8');
  rmSync(path.join(dataDir, ACTIVE_FILE));
  return summary;
}

export function listGameSummaries(dataDir: string): GameSummary[] {
  const histDir = path.join(dataDir, HISTORY_DIR);
  if (!existsSync(histDir)) return [];
  const files = readdirSync(histDir).filter((f) => f.endsWith('.json'));
  const summaries = files.map<GameSummary>((f) => {
    const raw = JSON.parse(readFileSync(path.join(histDir, f), 'utf-8')) as Partial<GameArchive> & { summary?: GameSummary };
    // Legacy {summary, state} format: pull out the inner summary.
    if (raw.summary) return raw.summary;
    const { id, startedAt, finishedAt, players, winnerSlot } = raw as GameArchive;
    return { id, startedAt, finishedAt, players, winnerSlot };
  });
  summaries.sort((a, b) => b.finishedAt - a.finishedAt);
  return summaries;
}

export function loadArchive(dataDir: string, id: string): GameArchive | null {
  const file = path.join(dataDir, HISTORY_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<GameArchive> & { summary?: GameSummary; state?: GameState };
  // Legacy {summary, state} format: assemble.
  if (raw.summary && raw.state) {
    return {
      ...raw.summary,
      finalBoard: raw.state.board,
      events: (raw.state.events ?? (raw.state as { history?: GameState['events'] }).history ?? []) as GameState['events'],
    };
  }
  return raw as GameArchive;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (persistence + assist + everything else).

- [ ] **Step 5: Commit**

```bash
git add server/persistence.ts tests/persistence.test.ts
git commit -m "feat(server): GameArchive — finalBoard + events in history files; loaders"
```

---

## Task 4: Server wiring — endGame archives, HTTP endpoints, broadcast plumbing

**Files:**
- Modify: `server/index.ts`
- Modify: `tests/server-http.test.ts` (create if missing)

- [ ] **Step 1: Inspect current `server/index.ts`** to find:
  - The Express `app` instance (where routes are registered).
  - The `endGame` switch case (currently returns `'not yet implemented'`).
  - The `dataDir` value used for persistence.

Run: `grep -n "app\.\|dataDir\|endGame\|saveActive\|archiveFinish" server/index.ts`

- [ ] **Step 2: Add HTTP endpoints**

In the same file (near the existing static-file middleware, before the WS upgrade), add:

```ts
app.get('/api/history', (_req, res) => {
  res.json(listGameSummaries(dataDir));
});

app.get('/api/history/:id', (req, res) => {
  const archive = loadArchive(dataDir, req.params.id);
  if (!archive) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(archive);
});
```

Add the necessary imports at top:

```ts
import { listGameSummaries, loadArchive } from './persistence.js';
```

(`saveActiveGame` and `archiveFinishedGame` are likely already imported.)

- [ ] **Step 3: Wire `endGame`**

Replace the `case 'endGame':` arm:

```ts
case 'endGame': {
  game.endGame(slot);
  saveActiveGame(dataDir, game.snapshot());
  const summary = archiveFinishedGame(dataDir);
  broadcastState();
  // Reset for next game lifecycle is handled when a new game starts; for M5 we just archive.
  // Optional: notify the lobby with the new summary list (broadcastState already includes recentGames).
  void summary;
  return;
}
```

Note: do NOT auto-create a new `Game` here — keep the server in `finished` phase until the operator restarts. The lobby already shows `recentGames` on next boot via `listGameSummaries`.

- [ ] **Step 4: Wire submit's optional `helperSlot`**

Find `handleSubmitMove` (or similar). Pass `{ helperSlot: msg.helperSlot }` through to `game.submitMove`. If the result is `ok: false` with `kind: 'invalid-helper'`, send a `moveRejected` with reason `'Помощник указан неверно'` (matching existing Russian-text style if present; otherwise English `'invalid helper'`).

```ts
const result = game.submitMove(slot, msg.placements, { helperSlot: msg.helperSlot });
```

Extend `humanReadableReason` to handle `'invalid-helper'`:

```ts
case 'invalid-helper': return 'Invalid helper slot';
```

- [ ] **Step 5: HTTP smoke test** in `tests/server-http.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '@server/index.js'; // adjust to actual exported name

let server: Awaited<ReturnType<typeof startServer>>;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'scrabble-http-'));
  server = await startServer({ port: 0, dataDir: dir }); // adjust args
});
afterEach(async () => { await server.close(); rmSync(dir, { recursive: true, force: true }); });

describe('history HTTP', () => {
  it('GET /api/history returns [] when no archives exist', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/history`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('GET /api/history/:id 404s for unknown id', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/history/nope`);
    expect(res.status).toBe(404);
  });
});
```

If `startServer` does not accept `dataDir` as an option today, look at the existing signature and either pass through env var `DATA_DIR` (set via `process.env.DATA_DIR = dir` before calling) or thread the option through. Match what already exists; do not invent a new API.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/index.ts tests/server-http.test.ts
git commit -m "feat(server): /api/history endpoints; endGame archives + broadcasts"
```

---

## Task 5: Demo script — at least one assisted move

**Files:**
- Modify: `scripts/demo-game.ts`

- [ ] **Step 1: Read the current script** to find an existing `submitMove` call.

Run: `grep -n "submitMove" scripts/demo-game.ts`

- [ ] **Step 2: Add a `helperSlot`** to one of the submitMove calls (e.g., the second one): pass `{ helperSlot: ((slot + 1) % 3) as Slot }`. After the move, log the helper's score change and the assist event.

```ts
const res = g.submitMove(currentSlot, placements, { helperSlot: ((currentSlot + 1) % 3) as Slot });
// existing logging…
const last = g.snapshot().events.at(-1);
if (last && last.kind === 'assist') {
  console.log(`  ↳ помог: slot ${last.toSlot} +${last.points}`);
}
```

- [ ] **Step 3: Run the demo**

Run: `npm run demo`
Expected: full game prints to stdout including at least one `↳ помог: slot N +5` line.

- [ ] **Step 4: Commit**

```bash
git add scripts/demo-game.ts
git commit -m "chore(demo): include an assisted move and print assist events"
```

---

## Task 6: Client store + WS — `events` rename, helper plumbing

**Files:**
- Modify: `client/src/store.ts`
- Modify: `client/src/ws.ts`

- [ ] **Step 1: Audit client for `state.history`**

Run: `grep -rn "\.history\b" client/src`
Replace each with `.events`.

- [ ] **Step 2: Add helper-selection state to the store**

```ts
type Store = {
  // …existing fields
  pendingHelper: Slot | null;
  setPendingHelper: (slot: Slot | null) => void;
};
// in the create() body:
pendingHelper: null,
setPendingHelper: (pendingHelper) => set({ pendingHelper }),
// also clear in clearPending:
clearPending: () => set({ pendingPlacements: [], pendingHelper: null, lastError: null }),
```

- [ ] **Step 3: Update `client/src/ws.ts`** so the `submitMove` send function accepts and forwards an optional `helperSlot`:

```ts
export function sendSubmitMove(placements: Placement[], helperSlot?: Slot) {
  send({ type: 'submitMove', placements, helperSlot });
}
```

If a generic `send(msg)` is what's there today, keep it generic and let the call site build the message — match the existing pattern.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (or only client-component errors handled in next tasks).

- [ ] **Step 5: Commit**

```bash
git add client/src/store.ts client/src/ws.ts
git commit -m "feat(client): pendingHelper state; helperSlot through submit"
```

---

## Task 7: Client UI — Helper picker on submit

**Files:**
- Modify: the component that renders the Submit/Recall buttons (likely `client/src/App.tsx` or a controls block within it — locate via `grep -n "Submit" client/src/**/*.tsx`)

- [ ] **Step 1: Locate the Submit button**

Run: `grep -rn "Submit\|submitMove\|sendSubmitMove" client/src`

- [ ] **Step 2: Add a helper-picker dropdown next to Submit**

Render only when `pendingPlacements.length > 0` and it's the local player's turn.

```tsx
const others = state.players.filter((p) => p.slot !== mySlot);
// …in JSX, near the Submit button:
<label className="text-sm">
  Помог:&nbsp;
  <select
    value={pendingHelper ?? ''}
    onChange={(e) => setPendingHelper(e.target.value === '' ? null : Number(e.target.value) as Slot)}
    className="border rounded px-1"
  >
    <option value="">никто</option>
    {others.map((p) => (
      <option key={p.slot} value={p.slot}>{p.name}</option>
    ))}
  </select>
</label>
```

When Submit is clicked, pass `pendingHelper ?? undefined` as the `helperSlot` argument.

- [ ] **Step 3: Manual UI smoke**

Run: `npm run dev`
Open three tabs with `?slot=0&name=A`, `?slot=1&name=B`, `?slot=2&name=C`. As the active slot, place tiles, pick "Помог: B", click Submit. Verify both your score and B's score update.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx  # adjust to actual file
git commit -m "feat(client): helper picker beside Submit"
```

---

## Task 8: Client UI — `<MoveLog>` panel

**Files:**
- Create: `client/src/components/MoveLog.tsx`
- Modify: `client/src/App.tsx` to mount it

- [ ] **Step 1: Create the component**

```tsx
import type { GameEvent, Player, Slot } from '@shared/types';
import { useEffect, useRef } from 'react';

type Props = { events: GameEvent[]; players: readonly Player[] };

const nameOf = (players: readonly Player[], slot: Slot) =>
  players.find((p) => p.slot === slot)?.name ?? `slot ${slot}`;

export function MoveLog({ events, players }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);

  return (
    <div ref={ref} className="h-64 overflow-y-auto border rounded p-2 text-sm font-mono">
      {events.length === 0 && <div className="text-gray-400">No moves yet</div>}
      {events.map((ev, i) => {
        if (ev.kind === 'move') {
          const words = ev.wordsFormed.map((w) => w.word).join(', ');
          return (
            <div key={i}>
              <span className="font-semibold">{nameOf(players, ev.slot)}</span>
              {' • '}
              <span>{words}</span>
              {' — '}
              <span>{ev.totalScore}</span>
              {ev.bingoBonus && <span className="ml-1 px-1 rounded bg-yellow-200">+10 бинго</span>}
            </div>
          );
        }
        return (
          <div key={i} className="pl-4 text-gray-600">
            ↳ помог{ev.toSlot === 0 ? 'ла' : ''}а {nameOf(players, ev.toSlot)} — +{ev.points}
          </div>
        );
        // (Russian gender suffix is approximate; refine later.)
      })}
    </div>
  );
}
```

- [ ] **Step 2: Mount in App**

Wherever the board + player cards are laid out, add:

```tsx
{state && <MoveLog events={state.events} players={state.players} />}
```

Place it under the board or in a side column — match the existing layout grid.

- [ ] **Step 3: Manual UI check**

Run `npm run dev`, play a couple of moves with one assist. Log shows them in order; assist line is indented under its move; auto-scrolls.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/MoveLog.tsx client/src/App.tsx
git commit -m "feat(client): live MoveLog panel"
```

---

## Task 9: Client UI — Past Games viewer

**Files:**
- Create: `client/src/PastGames.tsx`
- Modify: `client/src/App.tsx` (or `main.tsx`) — add a route or a toggle

- [ ] **Step 1: Decide route mechanism**

This project does not use react-router (verify with `grep -rn "react-router" client/`). If absent, use a simple URL-based switch in `App.tsx`:

```tsx
const view = new URLSearchParams(location.search).get('view');
if (view === 'past') return <PastGames />;
```

A button on the missing-params/lobby screen sets `?view=past`.

- [ ] **Step 2: Create `PastGames.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { GameSummary, GameArchive } from '@shared/types';
import { Board } from './components/Board';
import { MoveLog } from './components/MoveLog';

export function PastGames() {
  const [summaries, setSummaries] = useState<GameSummary[] | null>(null);
  const [open, setOpen] = useState<GameArchive | null>(null);

  useEffect(() => {
    void fetch('/api/history').then((r) => r.json()).then(setSummaries);
  }, []);

  if (open) {
    return (
      <div className="p-4">
        <button onClick={() => setOpen(null)} className="mb-3 underline">← back</button>
        <h2 className="text-lg font-semibold mb-2">
          {new Date(open.finishedAt).toLocaleString()} — winner: {
            open.winnerSlot === null ? 'tie' : open.players.find((p) => p.slot === open.winnerSlot)?.name
          }
        </h2>
        <div className="flex gap-4">
          {/* Reuse Board in non-interactive mode: pass board prop, omit drag/drop wiring. */}
          <Board board={open.finalBoard} interactive={false} />
          <div className="flex-1">
            <ul className="mb-3">
              {open.players.map((p) => (
                <li key={p.slot}>{p.name}: {p.finalScore}</li>
              ))}
            </ul>
            <MoveLog
              events={open.events}
              players={open.players.map((p) => ({
                slot: p.slot, name: p.name, connected: false, rack: [], rackVisible: false, score: p.finalScore,
              }))}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Прошлые игры</h1>
      {summaries === null && <div>Loading…</div>}
      {summaries !== null && summaries.length === 0 && <div>No games yet.</div>}
      <ul className="space-y-1">
        {summaries?.map((s) => (
          <li key={s.id}>
            <button
              className="underline text-left"
              onClick={() => fetch(`/api/history/${s.id}`).then((r) => r.json()).then(setOpen)}
            >
              {new Date(s.finishedAt).toLocaleString()} — {s.players.map((p) => `${p.name}:${p.finalScore}`).join(' / ')}
              {s.winnerSlot !== null && ` — winner: ${s.players.find((p) => p.slot === s.winnerSlot)?.name}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Make `<Board>` accept an `interactive` prop**

Open `client/src/components/Board.tsx`. Add an optional `interactive?: boolean` prop (default `true`). When `false`, render the same cells/tiles but skip the DnD context wiring. Keep the change minimal — wrap the DnD bits in a conditional, do not duplicate the JSX tree.

If this becomes more invasive than expected, a pragmatic alternative: copy the cell-rendering block into a small `<StaticBoard>` component and use it in `PastGames`. Choose whichever yields fewer lines changed.

- [ ] **Step 4: Add an entry-point button**

In `MissingParams.tsx` or wherever the lobby screen lives, add:

```tsx
<a href="?view=past" className="underline">Посмотреть прошлые игры</a>
```

- [ ] **Step 5: Manual smoke**

Build: `npm run build && npm start`. Or `npm run dev`. Open `http://localhost:5173/?view=past`. Verify the empty list. Play a quick game (use scripted demo or three tabs), end it, refresh `?view=past`, see the new entry, click it, see board + scores + log.

- [ ] **Step 6: Commit**

```bash
git add client/src/PastGames.tsx client/src/App.tsx client/src/components/Board.tsx client/src/MissingParams.tsx
git commit -m "feat(client): Past Games viewer (list + detail with board and log)"
```

---

## Task 10: Spec sync + final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-scrabble-design.md` (the source-of-truth spec, NOT the M5-additions design doc)

- [ ] **Step 1: Update §13 Out of Scope** — remove `- Game replay (history shows summary list only).` line. Optionally add `- Step-through replay (still out of scope).` to make the boundary explicit.

- [ ] **Step 2: Update §12 Milestones M5** — replace the existing M5 line with:

```
5. **M5 — Polish.** Disconnect/pause overlay, live move log panel, finished-game snapshots + Past Games viewer, "мама помогла" assist credit, dictionary advisory warnings, animations, deploy to Render.
```

- [ ] **Step 3: Add a brief mention of assist** to spec §3 (Russian house rules), one bullet:

```
- **Assist credit ("мама помогла").** When submitting a move, the active player may attribute it to one helper (one of the other two slots); the helper is awarded +5. Optional, at most one helper per move.
```

- [ ] **Step 4: Update CLAUDE.md status line** — change `M4 = lobby UI + remaining rule actions, M5 = polish + deploy.` to mention the new M5 scope. Replace with:

```
M4 = lobby UI + remaining rule actions, M5 = polish + log + snapshots + assist + deploy.
```

- [ ] **Step 5: Final verification**

Run: `npm run typecheck && npm test && npm run demo`
Expected: all PASS; demo prints at least one `↳ помог:` line.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-scrabble-design.md CLAUDE.md
git commit -m "docs: sync spec + CLAUDE.md with M5 additions"
```

---

## Done

At this point:
- Engine credits assists, validates helper slots, and records assists as first-class events.
- Persistence archives full game state with board + events; legacy files load via shim.
- Server exposes `/api/history` and `/api/history/:id`; `endGame` triggers archive + broadcast.
- Client shows a live move log, a helper picker on submit, and a Past Games viewer.
- Spec, CLAUDE.md, and the M5-additions design doc are consistent.
