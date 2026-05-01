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
- No assist on pass / redraw / claimBlank / endGame / revert — only on `submitMove`.
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

export type PassRecord = {
  kind: 'pass';
  slot: Slot;
  timestamp: number;
};

export type RedrawRecord = {
  kind: 'redraw';
  slot: Slot;
  reason: 'allVowels' | 'allConsonants';   // why the player was eligible
  tileCount: number;                        // how many tiles were exchanged
  timestamp: number;
};

export type ClaimBlankRecord = {
  kind: 'claimBlank';
  slot: Slot;
  row: number;
  col: number;
  letterAs: string;
  timestamp: number;
};

export type EndGameRecord = {
  kind: 'endGame';
  slot: Slot;            // who triggered, or the natural-end pseudo-slot
  cause: 'playerEnded' | 'bagEmptyAndRackEmpty' | 'sixPasses';
  timestamp: number;
};

export type RevertRecord = {
  kind: 'revert';
  slot: Slot;                      // the player who reverted their own action
  revertedKind: GameEvent['kind']; // what was undone
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

// GameState.history: MoveRecord[]   →   GameState.events: GameEvent[]
```

**Revert semantics in the log.** A revert appends a `RevertRecord` rather than removing the prior entry — the log is append-only. If the reverted move had an `AssistRecord` attached, the assist's points are reversed at the same time and a second `RevertRecord` (with `revertedKind: 'assist'`) is appended. Past Games archives therefore show the full sequence (move → assist → revert → revert), which matches what the players saw live.

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
- Misclicks ride along with the move's revert window (M4b): if the submitter reverts the move, the helper's +5 is reversed too (see "Revert semantics in the log" in §3). Once the revert window closes, the assist is final — no separate undo.
- End-of-game leftover-tile accounting is unaffected — assist points are just regular score.

## 5. Move log UI (live)

New `<MoveLog>` component, rendered in the right column **below the three player cards**, in the same rail. Fills available height; internal scroll; no overlap with the action bar / rack at the bottom.

- Reads `state.events`. Newest at the bottom; auto-scroll on append.
- Entry formats:
  - Move: `Женя • КОТ, ОК — 9` (multi-word moves comma-separated; bingo gets a small `+10 бинго` chip).
  - Assist: indented under its move, muted: `↳ помогла мама — +5`.
  - Pass: `Женя • пас`.
  - Redraw: `Женя • обмен (все гласные)` / `все согласные`, with a tile count where helpful.
  - ClaimBlank: `Женя • ★→К на e7` (uses the existing star glyph + cell coord).
  - EndGame: italicized terminal line — `Игра окончена (Женя завершил)` / `(закончились буквы)` / `(шесть пасов)`.
  - Revert: indented under the reverted entry, muted, struck-through reference — `↳ отменено`.
- No virtualization, no filtering, no per-entry interactions.

## 5b. Helper picker UX

The "мама помогла" selector lives **on the existing submit confirm modal**, not as a separate step.

- The modal already opens on Submit and shows the words/score preview. Add a small block below it: label "Кто помог?" and three options — `никто` (default) plus the two other players' names. Single-select.
- Selecting a helper is reflected in the same `sendSubmitMove(...)` call via the new optional `helperSlot` field. No second confirm.
- If the move is rejected by the server, the picker selection is discarded along with the rest of the attempt.
- Pass / redraw / claimBlank / endGame / revert do not show a helper picker — assist is move-only (§2 non-goal).

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
- `tests/game.test.ts` — assist adds 5 to helper; helper validation (`helperSlot === submitter`, invalid slot); assist not applied if move is rejected; `AssistRecord.forMoveIndex` correctness; natural-end path triggers archive write; every action method (`submitMove`, `passTurn`, `redrawRack`, `claimBlank`, `endGame`, `revertLastTurn`) appends exactly one record of the right `kind` to `events`; revert of a move that had an assist also appends a `revert` record for the assist and reverses the +5.
- `tests/persistence.test.ts` — round-trip `GameArchive`; summary loader returns just the summary slice; `history`/`events` rename shim works.
- `tests/moves.test.ts` (or new `tests/assist.test.ts`) — helper validation rules in isolation.

**Integration / smoke:**
- Extend `scripts/demo-game.ts` so at least one move includes a `helperSlot`; printed final state shows the assist event.

**Manual UI:**
- Submit a move with a helper selected; verify both scores update, log shows move + indented assist.
- End a game; open Past Games; verify list and detail views render board + log + scores.

## 9. Order of work (for the plan)

1. Types: rename `history` → `events`, add `kind` discriminant on `MoveRecord`, add `AssistRecord` + `PassRecord` + `RedrawRecord` + `ClaimBlankRecord` + `EndGameRecord` + `RevertRecord`, add `helperSlot`, add `GameArchive`, extend `submitMove`.
2. Server engine — event emission: every existing action method (`submitMove`, `passTurn`, `redrawRack`, `claimBlank`, `endGame`, `revertLastTurn`) appends its corresponding record to `events`. Revert is append-only (does not pop prior entries) and reverses any attached assist points. Tests.
3. Server engine — assist: validation + scoring path on `submitMove`; tests.
4. Persistence: archive format upgrade, summary loader, archive loader, `history`→`events` rename shim; tests.
5. HTTP: `/api/history` and `/api/history/:id`.
6. Client store: handle renamed `events`; thread `helperSlot` through `submitMove`.
7. Client UI: helper picker on submit confirm modal; `<MoveLog>` panel in the right rail under player cards; Past Games list + detail route.
8. Demo script: add an assisted move and a revert; manual UI pass.
