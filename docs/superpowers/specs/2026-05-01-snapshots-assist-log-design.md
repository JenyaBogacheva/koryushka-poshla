# M5 additions — Snapshots, Assist Credit, Move Log

**Date:** 2026-05-01
**Milestone:** folds into M5 ("Polish") — extends, does not replace.
**Touches:** `shared/types.ts`, `server/game.ts`, `server/persistence.ts`, `server/index.ts` (HTTP), client store + new components.

## 1. Goals

Three additions, all driven by the family-game use case:

1. **Assist credit ("мама помогла").** A player submitting a move can attribute it to a helper (one of the other two slots). Helper gets +5 points.
2. **Move log.** A scrollable panel during play showing every move and assist event in order, with author and points. The same log is embedded in the archived game.
3. **Game snapshots.** When a game finishes, archive the full final state (board, scores, complete event log) — not just a summary. Add a "Past games" UI to browse them.

Existing spec §13 line "Game replay (history shows summary list only)" is removed; in its place: snapshot viewer (final-state view, not a step-through replay).

## 2. Non-goals

- No step-through replay (still out of scope).
- No edit / fork / resume of past games.
- No undo of moves or of assist credits.
- No assist on swap/pass/redraw — only on `submitMove`.
- No per-game cap on assists; family honor system.
- No browser automation tests.

## 3. Data model (`shared/types.ts`)

```ts
export type MoveRecord = {
  kind: 'move';
  slot: Slot;
  placements: Placement[];
  wordsFormed: WordFormed[];
  totalScore: number;
  bingoBonus: boolean;
  helperSlot: Slot | null;   // NEW
  timestamp: number;
};

export type AssistRecord = {
  kind: 'assist';
  fromSlot: Slot;            // submitter who credited
  toSlot: Slot;              // helper who got +5
  points: 5;
  forMoveIndex: number;      // index into events[] of the move it was attached to
  timestamp: number;
};

export type GameEvent = MoveRecord | AssistRecord;

// GameState.history: MoveRecord[]   →   GameState.events: GameEvent[]
```

`submitMove` gains an optional `helperSlot`:

```ts
| { type: 'submitMove'; placements: Placement[]; helperSlot?: Slot }
```

Archived game format replaces the slim `GameSummary`:

```ts
export type GameArchive = {
  id: string;
  startedAt: number;
  finishedAt: number;
  players: { slot: Slot; name: string; finalScore: number }[];
  winnerSlot: Slot | null;
  finalBoard: Board;       // NEW
  events: GameEvent[];     // NEW
};
```

The lobby's `recentGames: GameSummary[]` stays a summary projection — the full archive is fetched only when opened.

## 4. Assist mechanics

**Validation** (server-side, on `submitMove`):
- If `helperSlot` is present: must be `0|1|2`, must differ from submitter's slot, and must refer to an existing player. Otherwise → `moveRejected: 'invalid helper'`.
- Assist is only applied if the move itself is valid. Rejected moves give nothing.

**Application** (in `Game.submitMove`, after the move is committed):
1. Push `MoveRecord { ..., helperSlot }` to `events`.
2. If `helperSlot != null`: `players[helperSlot].score += 5`; push `AssistRecord` with `forMoveIndex = events.length - 1` (the move just pushed).

**Properties:**
- Assist points count toward winning.
- Assist does not affect turn order, does not consume the helper's turn, does not on its own trigger end-of-game.
- No undo. Misclicks are absorbed by the family.
- End-of-game leftover-tile accounting is unaffected — assist points are just regular score.

## 5. Move log UI (live)

New `<MoveLog>` component, rendered alongside the board (placement TBD by client layout).

- Reads `state.events`. Newest at the bottom; auto-scroll.
- Move entry: `Женя • КОТ, ОК — 9` (multi-word moves comma-separated; bingo gets a small `+10 бинго` chip).
- Assist entry: indented under its move, muted: `↳ помогла мама — +5`.
- No virtualization, no filtering, no per-entry interactions.
- Swap/pass/redraw events do not appear in M5 (they're not yet in the event log type — when M4-style actions are added later, they extend `GameEvent`).

## 6. Past Games viewer

**HTTP endpoints** (added to existing Express server):
- `GET /api/history` → list of summaries from `data/history/*.json` (id, dates, players, winner, final scores).
- `GET /api/history/:id` → full `GameArchive` for one game.

Files are read fresh from disk per request. No caching layer.

**UI:** new "Past games" route (or button on the lobby/missing-params screen).
- List view: game date, player names, winner.
- Detail view: read-only — final board (reuse `<Board>` in non-interactive mode), final scores per player card, full `<MoveLog>` of `events`.
- No resume, no fork, no edit.

## 7. Persistence (`server/persistence.ts`)

- `saveActive(game)` — same job, with the renamed `events` field.
- `archiveGame(game)` — called from `Game.endGame()` and from the natural-end path. Writes the full `GameArchive` (id, dates, players, winnerSlot, finalBoard, events).
- `loadHistorySummaries()` — new — scans `data/history/*.json`, returns the summary slice.
- `loadArchive(id)` — new — reads one archive file in full.

**Migration:**
- `data/` is gitignored runtime state.
- `loadActive()` accepts either `history` or `events` field on read; rewrites with `events` on next save. One-shot shim, deleted later.
- Archives written before this change have only the summary fields; viewer renders them with a "(archived before snapshots existed)" note in place of the board/log.

## 8. Tests

**Unit (Vitest):**
- `tests/game.test.ts` — assist adds 5 to helper; helper validation (`helperSlot === submitter`, invalid slot); assist not applied if move is rejected; `AssistRecord.forMoveIndex` correctness; natural-end path triggers archive write.
- `tests/persistence.test.ts` — round-trip `GameArchive`; summary loader returns just the summary slice; `history`/`events` rename shim works.
- `tests/moves.test.ts` (or new `tests/assist.test.ts`) — helper validation rules in isolation.

**Integration / smoke:**
- Extend `scripts/demo-game.ts` so at least one move includes a `helperSlot`; printed final state shows the assist event.

**Manual UI:**
- Submit a move with a helper selected; verify both scores update, log shows move + indented assist.
- End a game; open Past Games; verify list and detail views render board + log + scores.

## 9. Order of work (for the plan)

1. Types: rename `history` → `events`, add `kind` discriminant, add `AssistRecord`, add `helperSlot`, add `GameArchive`, extend `submitMove`.
2. Server engine: validation + scoring path for assist; tests.
3. Persistence: archive format upgrade, summary loader, archive loader, rename shim; tests.
4. HTTP: `/api/history` and `/api/history/:id`.
5. Client store: handle renamed `events`; thread `helperSlot` through `submitMove`.
6. Client UI: helper picker on Submit; `<MoveLog>` panel; Past Games list + detail.
7. Demo script: add an assisted move; manual UI pass.
