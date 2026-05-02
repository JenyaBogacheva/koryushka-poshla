# M6a — Gamification (per-game badges + celebration)

## 1. Goal

Make every finished game feel like an event. Add lightweight, per-game badges that celebrate noteworthy moves and final standings, plus a celebratory game-end screen that reveals all three places.

This is the first slice of M6 (see `docs/superpowers/specs/2026-04-30-scrabble-design.md` §12.6). Cross-game leaderboards and cumulative achievements are deferred to **M6b**.

## 2. Scope

In scope:

- Six badges (three per-move, three end-of-game).
- Live badges: per-move badges appear on the player's card the moment the move is submitted, and persist for the rest of the game.
- Game-end celebration overlay shown on the first transition to `phase='finished'`.
- Past Games viewer reflects the same badges (recomputed from archive).

Out of scope (M6b):

- Cross-game leaderboard / career stats.
- Cumulative achievements ("20 bingos lifetime").
- Badge persistence across games.
- Player avatars or profile pages.

## 3. Badges

| Kind             | Russian label     | Trigger                                                                          | When awarded    |
| ---------------- | ----------------- | -------------------------------------------------------------------------------- | --------------- |
| `bingo`          | Бинго             | A single `submitMove` places all 7 tiles from the rack.                          | Live, per move. |
| `longWord`       | Длинное слово     | A single `submitMove` forms any newly-played word of length ≥ 7 letters.         | Live, per move. |
| `bigMove`        | Крупный ход       | A single `submitMove` scores ≥ 50 points (move total, including all multipliers and the +10 bingo bonus). | Live, per move. |
| `helper`         | Помощник          | At game end, the player(s) credited with the most assists (`helperSlot=` tagged moves). Ties → all tied players receive it. If max assists is 0, no one receives it. | End of game.    |
| `gold`           | Золото            | Highest final score.                                                             | End of game.    |
| `silver`         | Серебро           | Strictly second-highest final score (only awarded if 1st place is not tied).     | End of game.    |
| `bronze`         | Бронза            | Strictly third-place score (only awarded if 2nd place is not tied).              | End of game.    |

### 3.1 Repeatable badges

`bingo`, `longWord`, and `bigMove` can be earned multiple times in one game. The UI shows a count when count ≥ 2 (e.g. `🎯×2`). One move may trigger more than one badge (a 7-tile bingo forming an 8-letter word scoring 60 = three badges from a single move).

### 3.2 Place-badge tie semantics

Standard sports semantics, no skipping below the tie:

| Final scores (sorted) | Badges                            |
| --------------------- | --------------------------------- |
| 100 / 80 / 60         | gold, silver, bronze              |
| 100 / 100 / 60        | gold, gold, bronze (no silver)    |
| 100 / 80 / 80         | gold, silver, silver (no bronze)  |
| 100 / 100 / 100       | gold, gold, gold                  |
| 80 / 80 / 100         | (sorted same as above; mapping is by score, not by slot order) |

The engine has no prior winner/tie-break logic; this spec defines it for the gamification layer only.

## 4. Architecture

Server-authoritative, consistent with the rest of the codebase. Badges are **derived**, not stored — no schema changes to `GameArchive` or `MoveRecord`.

### 4.1 New module: `server/badges.ts`

Pure module, two exports:

```ts
export type BadgeKind =
  | 'bingo'
  | 'longWord'
  | 'bigMove'
  | 'helper'
  | 'gold'
  | 'silver'
  | 'bronze';

export function perMoveBadges(record: MoveRecord): BadgeKind[];

export function endGameBadges(
  events: GameEvent[],
  scores: Record<Slot, number>,
): Record<Slot, BadgeKind[]>;
```

- `perMoveBadges` returns the badges earned by a single `MoveRecord` (zero, one, or many).
- `endGameBadges` derives `helper` + place badges from the full event log and final scores. Returns badges keyed by slot, in a stable order (place badges first, then `helper`).

Both functions are pure and have no I/O.

### 4.2 `shared/types.ts`

Add and export `BadgeKind` (the same union as above) so the client can render labels and icons. No other type changes.

### 4.3 Wire-up

- `server/game.ts` does **not** call `badges.ts`. Badges are derived view-state, computed by whoever needs them.
- The client computes live per-move badges by calling `perMoveBadges` on each `MoveRecord` it sees in the event stream (or in the archive for Past Games).
- The client computes end-of-game badges by calling `endGameBadges(state.events, state.scores)` once `phase === 'finished'`.

This keeps the engine free of presentation logic and lets the Past Games viewer reuse the same code with zero plumbing.

### 4.4 Why no persistence

Badges are a deterministic function of `events` + `scores`, both of which are already persisted in `GameArchive`. Recomputing on read costs microseconds and avoids a schema migration. If M6b later wants to aggregate badges across games, it can iterate archives and call the same pure functions.

## 5. Client UX

### 5.1 PlayerCard badge strip

A horizontal strip rendered below the player's name on `PlayerCard`. Each badge: emoji + count (when ≥ 2). Examples:

```
Маша  🎯  📏×2  💥
```

- Updates live as moves arrive.
- During `phase='playing'`, only per-move badges appear.
- After `phase='finished'`, place + `helper` badges are appended to the same strip (place badge first).

### 5.2 Game-end celebration overlay

Triggered exactly once: when the client observes the first transition into `phase='finished'`. Implemented as a full-screen modal (`fixed inset-0 z-50`, consistent with `FinishedScreen`).

Sequence (~3.5s total):

1. Backdrop fades in.
2. Winner's name appears large and centered; final score counts up from 0 over ~800ms.
3. Place medals (🥇/🥈/🥉) animate in from the bottom for each player, ordered by place, ~250ms apart, with a small pop (scale 0.5 → 1.1 → 1.0).
4. End-of-game badges (Помощник) appear last on the relevant player(s), same pop animation.
5. A confetti burst (CSS-only particles, ~2s) plays over the gold-medal player(s) only.

The overlay is dismissed by tap/click anywhere or after a 6s auto-dismiss timeout. Dismissing settles into the regular `FinishedScreen`, with the badge strip now permanently showing the full set.

If the user reloads after dismissal, the overlay does not replay (state lives in the client, not in the archive).

### 5.3 Past Games viewer

`PastGamesDetail` shows the same badge strip on each player, computed via the same pure functions. No celebration overlay (no first-transition moment).

### 5.4 Russian-only UI

All labels and tooltips are in Russian per the project memory. Emoji icons are language-neutral. Tooltip text on hover (desktop):

| Badge      | Tooltip                                |
| ---------- | -------------------------------------- |
| `bingo`    | Бинго — все 7 фишек за один ход        |
| `longWord` | Длинное слово — 7 букв и больше        |
| `bigMove`  | Крупный ход — 50 очков и больше        |
| `helper`   | Помощник — больше всего подсказок      |
| `gold`     | Золото — первое место                  |
| `silver`   | Серебро — второе место                 |
| `bronze`   | Бронза — третье место                  |

## 6. Testing

### 6.1 Unit tests — `tests/badges.test.ts`

`perMoveBadges`:

- Bingo only (7 tiles, short word, low score).
- Long-word only (≥7-letter word formed but <7 tiles placed and <50 points).
- Big-move only (≥50 points but <7 tiles, all words <7 letters).
- All three at once.
- Edge: 6-letter word → no `longWord`; 7-letter word → yes.
- Edge: 49 points → no `bigMove`; 50 points → yes.
- Edge: 6 tiles placed → no `bingo`; 7 tiles → yes.
- Non-`MoveRecord` event (e.g. `pass`) → returns `[]`.

`endGameBadges`:

- Distinct scores 100/80/60 → gold/silver/bronze to correct slots.
- 1st-place tie 100/100/60 → two gold, no silver, one bronze.
- 2nd-place tie 100/80/80 → one gold, two silver, no bronze.
- All-tie 100/100/100 → three gold.
- Helper assigned to single max assist holder.
- Helper shared on assist tie.
- No helper if all players have 0 assists.

### 6.2 Integration tests

Extend an existing M5a integration test (`tests/integration/m5a-server.test.ts` or sibling) to:

- Play a scripted game where one move triggers `bingo` and `longWord`, and another triggers `bigMove`.
- Assert the resulting `events` array, when fed through `endGameBadges` + per-move loop, yields the expected badge map.
- Confirm the archived game (loaded back through `loadArchive`) yields the same map (deterministic recompute).

### 6.3 Demo script

`scripts/demo-game.ts` prints each player's full badge list at the end (after the existing score line). Verifies the pure functions work against a real end-to-end game without UI.

### 6.4 Manual UI testing

- Trigger a bingo and confirm the badge animates onto the PlayerCard immediately.
- End a game and confirm: celebration sequence plays, place badges appear in the right order, confetti plays only on gold, overlay dismisses on tap and on timeout, FinishedScreen below shows the full badge strip.
- Open the same game from Past Games and confirm the badge strip matches.

## 7. File touch list

New:

- `server/badges.ts`
- `tests/badges.test.ts`
- `client/src/components/GameEndCelebration.tsx`
- `client/src/components/BadgeStrip.tsx`

Modified:

- `shared/types.ts` — add `BadgeKind` export.
- `client/src/components/PlayerCard.tsx` — render `BadgeStrip`.
- `client/src/components/FinishedScreen.tsx` — wrap/coordinate with `GameEndCelebration`.
- `client/src/components/PastGamesDetail.tsx` — render `BadgeStrip` on each player.
- `client/src/styles/index.css` — pop + confetti keyframes.
- `scripts/demo-game.ts` — print badges.
- `tests/integration/m5a-server.test.ts` (or new sibling) — assert badge derivation.

## 8. Open questions

None at spec time. Implementation plan will sequence the work.
