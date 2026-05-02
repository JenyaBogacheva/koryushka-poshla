# M6a — Gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-game badges (live + end-of-game) and a celebratory game-end overlay to the Scrabble client.

**Architecture:** Badges are derived view-state computed from `GameEvent[]` + final scores. A new pure server module `server/badges.ts` exposes `perMoveBadges(record)` and `endGameBadges(events, scores)`. The client calls these at render time. No new persistence; no engine changes.

**Tech Stack:** TypeScript (strict, NodeNext), Vitest, React 19 + Tailwind 4, Zustand store. Existing `@shared/*` and `@server/*` path aliases.

**Spec:** `docs/superpowers/specs/2026-05-02-m6a-gamification-design.md`

---

## Task 1: Add `BadgeKind` to shared types

**Files:**
- Modify: `shared/types.ts` (append after the existing exports, before the WebSocket protocol section comment around line 165)

- [ ] **Step 1: Add the type**

Append this block in `shared/types.ts` immediately before the `// --- WebSocket protocol …` comment:

```ts
export type BadgeKind =
  | 'bingo'
  | 'longWord'
  | 'bigMove'
  | 'helper'
  | 'gold'
  | 'silver'
  | 'bronze';
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): add BadgeKind union for gamification"
```

---

## Task 2: `perMoveBadges` — failing tests

**Files:**
- Create: `tests/badges.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/badges.test.ts` with this content:

```ts
import { describe, it, expect } from 'vitest';
import { perMoveBadges } from '@server/badges.js';
import type { MoveRecord, PassRecord } from '@shared/types';

function move(overrides: Partial<MoveRecord> = {}): MoveRecord {
  return {
    kind: 'move',
    slot: 0,
    placements: [],
    wordsFormed: [],
    totalScore: 0,
    bingoBonus: false,
    helperSlot: null,
    dictionaryWarnings: [],
    timestamp: 0,
    ...overrides,
  };
}

function placements(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    tileId: `t-${i}`,
    row: 7,
    col: i,
    playedAs: 'А',
  }));
}

function word(letters: string) {
  return {
    word: letters,
    cells: Array.from({ length: letters.length }, (_, i) => ({ row: 7, col: i })),
    score: 0,
  };
}

describe('perMoveBadges', () => {
  it('awards bingo when 7 tiles are placed', () => {
    const r = move({ placements: placements(7), wordsFormed: [word('КОРЮШКА')], totalScore: 60, bingoBonus: true });
    expect(perMoveBadges(r).sort()).toEqual(['bigMove', 'bingo', 'longWord']);
  });

  it('does not award bingo on 6 tiles', () => {
    const r = move({ placements: placements(6), wordsFormed: [word('КАРТА')], totalScore: 12 });
    expect(perMoveBadges(r)).toEqual([]);
  });

  it('awards longWord for any 7+ letter word formed', () => {
    const r = move({ placements: placements(2), wordsFormed: [word('КОРОТКО'), word('ДА')], totalScore: 20 });
    expect(perMoveBadges(r)).toEqual(['longWord']);
  });

  it('does not award longWord at length 6', () => {
    const r = move({ placements: placements(2), wordsFormed: [word('КАРТЫ')], totalScore: 12 });
    expect(perMoveBadges(r)).toEqual([]);
  });

  it('awards bigMove at exactly 50 points', () => {
    const r = move({ placements: placements(3), wordsFormed: [word('КАРТА')], totalScore: 50 });
    expect(perMoveBadges(r)).toEqual(['bigMove']);
  });

  it('does not award bigMove at 49 points', () => {
    const r = move({ placements: placements(3), wordsFormed: [word('КАРТА')], totalScore: 49 });
    expect(perMoveBadges(r)).toEqual([]);
  });

  it('returns [] for non-move events', () => {
    const pass: PassRecord = { kind: 'pass', slot: 1, timestamp: 0 };
    expect(perMoveBadges(pass as unknown as MoveRecord)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/badges.test.ts`
Expected: FAIL with "Failed to resolve import @server/badges.js" or similar — module does not exist yet.

---

## Task 3: `perMoveBadges` — implementation

**Files:**
- Create: `server/badges.ts`

- [ ] **Step 1: Implement the function**

Create `server/badges.ts`:

```ts
import type { BadgeKind, GameEvent, MoveRecord, Slot } from '@shared/types';

const LONG_WORD_MIN = 7;
const BIG_MOVE_MIN = 50;
const RACK_SIZE = 7;

export function perMoveBadges(event: GameEvent | MoveRecord): BadgeKind[] {
  if (event.kind !== 'move') return [];
  const record = event as MoveRecord;
  const badges: BadgeKind[] = [];
  if (record.placements.length === RACK_SIZE) badges.push('bingo');
  if (record.wordsFormed.some((w) => [...w.word].length >= LONG_WORD_MIN)) badges.push('longWord');
  if (record.totalScore >= BIG_MOVE_MIN) badges.push('bigMove');
  return badges;
}

export function endGameBadges(
  _events: GameEvent[],
  _scores: Record<Slot, number>,
): Record<Slot, BadgeKind[]> {
  // Implemented in Task 5.
  return { 0: [], 1: [], 2: [] };
}
```

Note: word length uses `[...w.word].length` to count Cyrillic codepoints correctly (no surrogate pairs in BMP Cyrillic, but this is the correct idiom).

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/badges.test.ts`
Expected: All `perMoveBadges` tests PASS. (No `endGameBadges` tests yet.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/badges.ts tests/badges.test.ts
git commit -m "feat(badges): perMoveBadges (bingo, longWord, bigMove)"
```

---

## Task 4: `endGameBadges` — failing tests

**Files:**
- Modify: `tests/badges.test.ts` (append a new `describe` block at the end of the file)

- [ ] **Step 1: Add the failing tests**

Append to `tests/badges.test.ts`:

```ts
import { endGameBadges } from '@server/badges.js';
import type { AssistRecord, Slot } from '@shared/types';

function assist(fromSlot: Slot, toSlot: Slot): AssistRecord {
  return { kind: 'assist', fromSlot, toSlot, points: 5, forMoveIndex: 0, timestamp: 0 };
}

describe('endGameBadges — places', () => {
  it('awards gold/silver/bronze for distinct scores', () => {
    const out = endGameBadges([], { 0: 100, 1: 80, 2: 60 });
    expect(out[0]).toEqual(['gold']);
    expect(out[1]).toEqual(['silver']);
    expect(out[2]).toEqual(['bronze']);
  });

  it('shares gold and skips silver on 1st-place tie', () => {
    const out = endGameBadges([], { 0: 100, 1: 100, 2: 60 });
    expect(out[0]).toEqual(['gold']);
    expect(out[1]).toEqual(['gold']);
    expect(out[2]).toEqual(['bronze']);
  });

  it('shares silver and skips bronze on 2nd-place tie', () => {
    const out = endGameBadges([], { 0: 100, 1: 80, 2: 80 });
    expect(out[0]).toEqual(['gold']);
    expect(out[1]).toEqual(['silver']);
    expect(out[2]).toEqual(['silver']);
  });

  it('three-way tie → three golds', () => {
    const out = endGameBadges([], { 0: 50, 1: 50, 2: 50 });
    expect(out[0]).toEqual(['gold']);
    expect(out[1]).toEqual(['gold']);
    expect(out[2]).toEqual(['gold']);
  });

  it('mapping is by score, not slot order', () => {
    const out = endGameBadges([], { 0: 60, 1: 100, 2: 80 });
    expect(out[0]).toEqual(['bronze']);
    expect(out[1]).toEqual(['gold']);
    expect(out[2]).toEqual(['silver']);
  });
});

describe('endGameBadges — helper', () => {
  it('awards helper to single max-assist giver', () => {
    const events = [assist(0, 1), assist(0, 2), assist(1, 2)];
    const out = endGameBadges(events, { 0: 50, 1: 30, 2: 30 });
    expect(out[0]).toContain('helper');
    expect(out[1]).not.toContain('helper');
    expect(out[2]).not.toContain('helper');
  });

  it('shares helper on tie', () => {
    const events = [assist(0, 1), assist(2, 1)];
    const out = endGameBadges(events, { 0: 50, 1: 50, 2: 50 });
    expect(out[0]).toContain('helper');
    expect(out[2]).toContain('helper');
    expect(out[1]).not.toContain('helper');
  });

  it('no helper if no assists', () => {
    const out = endGameBadges([], { 0: 10, 1: 10, 2: 10 });
    expect(out[0]).not.toContain('helper');
    expect(out[1]).not.toContain('helper');
    expect(out[2]).not.toContain('helper');
  });

  it('place badge appears before helper in returned array', () => {
    const events = [assist(0, 1)];
    const out = endGameBadges(events, { 0: 100, 1: 80, 2: 60 });
    expect(out[0]).toEqual(['gold', 'helper']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/badges.test.ts`
Expected: FAIL — most `endGameBadges` tests fail because the stub returns empty arrays.

---

## Task 5: `endGameBadges` — implementation

**Files:**
- Modify: `server/badges.ts` (replace the stub `endGameBadges`)

- [ ] **Step 1: Replace the stub**

In `server/badges.ts`, replace the `endGameBadges` stub with:

```ts
export function endGameBadges(
  events: GameEvent[],
  scores: Record<Slot, number>,
): Record<Slot, BadgeKind[]> {
  const slots: Slot[] = [0, 1, 2];
  const result: Record<Slot, BadgeKind[]> = { 0: [], 1: [], 2: [] };

  // Place badges. Sort distinct scores descending; first three buckets are gold/silver/bronze,
  // skipping a medal whenever the previous bucket had more than one slot in it.
  const distinctScoresDesc = [...new Set(slots.map((s) => scores[s]))].sort((a, b) => b - a);
  const buckets = distinctScoresDesc.map((score) => slots.filter((s) => scores[s] === score));

  const medals: BadgeKind[] = ['gold', 'silver', 'bronze'];
  let medalIndex = 0;
  for (const bucket of buckets) {
    if (medalIndex >= medals.length) break;
    const medal = medals[medalIndex]!;
    for (const slot of bucket) result[slot].push(medal);
    medalIndex += bucket.length;
  }

  // Helper badge: most assists given (AssistRecord.fromSlot). Ties → all winners. Zero → no one.
  const assistsBySlot: Record<Slot, number> = { 0: 0, 1: 0, 2: 0 };
  for (const e of events) {
    if (e.kind === 'assist') assistsBySlot[e.fromSlot] += 1;
  }
  const maxAssists = Math.max(assistsBySlot[0], assistsBySlot[1], assistsBySlot[2]);
  if (maxAssists > 0) {
    for (const s of slots) {
      if (assistsBySlot[s] === maxAssists) result[s].push('helper');
    }
  }

  return result;
}
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/badges.test.ts`
Expected: All tests in the file PASS.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: All tests PASS (no regressions).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/badges.ts tests/badges.test.ts
git commit -m "feat(badges): endGameBadges (places + helper)"
```

---

## Task 6: Integration test — badges derive from archive

**Files:**
- Modify: `tests/integration/m5a-server.test.ts` (append a new test at the end of the existing top-level `describe`, before the closing brace)

- [ ] **Step 1: Inspect the existing file**

Read `tests/integration/m5a-server.test.ts` and locate the top-level `describe(...)` closing brace. Locate any existing helper for spinning up the server and connecting WS clients — reuse it; do NOT duplicate.

- [ ] **Step 2: Append the integration test**

Inside the top-level `describe`, append:

```ts
  it('derives badges from a finished archive (deterministic recompute)', async () => {
    // Use the existing per-test helpers to: start the server, join 3 clients,
    // play a scripted scenario where slot 0 places 7 tiles forming a 7+ letter
    // word scoring >=50, then end the game.
    //
    // After the game is archived (via existing endGame archival path), GET
    // /api/history/<id> and assert:
    //   - perMoveBadges(moveRecord) on the bingo move includes 'bingo',
    //     'longWord', and 'bigMove'.
    //   - endGameBadges(archive.events, scoresMap) maps slot 0 to ['gold', ...].
    //
    // Implementation note: build scoresMap from archive.players:
    //   const scores = Object.fromEntries(
    //     archive.players.map((p) => [p.slot, p.finalScore]),
    //   ) as Record<Slot, number>;
  });
```

Then flesh out the body using the same patterns as the surrounding tests in this file. The existing tests already cover bag manipulation / scripted moves; copy that pattern.

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run tests/integration/m5a-server.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/m5a-server.test.ts
git commit -m "test(badges): integration — badges derive from archive round-trip"
```

---

## Task 7: Demo script prints badges

**Files:**
- Modify: `scripts/demo-game.ts`

- [ ] **Step 1: Inspect the demo script**

Read `scripts/demo-game.ts`. Locate the section near the end where final scores are printed.

- [ ] **Step 2: Append badge printout**

After the existing final-scores print block, add:

```ts
import { perMoveBadges, endGameBadges } from '../server/badges.js';
// (Place this import with the other top-of-file imports, not inline.)

// After endGame, near the existing scores printout:
const finalState = game.state;
const scoresMap = {
  0: finalState.players[0].score,
  1: finalState.players[1].score,
  2: finalState.players[2].score,
} as const;

const endBadges = endGameBadges(finalState.events, scoresMap);
const perMoveTotals: Record<number, Record<string, number>> = { 0: {}, 1: {}, 2: {} };
for (const e of finalState.events) {
  if (e.kind !== 'move') continue;
  for (const b of perMoveBadges(e)) {
    perMoveTotals[e.slot][b] = (perMoveTotals[e.slot][b] ?? 0) + 1;
  }
}

for (const slot of [0, 1, 2] as const) {
  const live = Object.entries(perMoveTotals[slot]).map(([k, v]) => `${k}×${v}`).join(', ');
  const end = endBadges[slot].join(', ');
  console.log(`  Slot ${slot} badges: end=[${end}] live=[${live}]`);
}
```

(Adapt the symbol names — `game`, `finalState` — to whatever the demo script actually uses for its game instance.)

- [ ] **Step 3: Run the demo**

Run: `npm run demo`
Expected: Demo completes; final block prints badges per slot.

- [ ] **Step 4: Commit**

```bash
git add scripts/demo-game.ts
git commit -m "chore(demo): print per-game badges at end of demo"
```

---

## Task 8: `BadgeStrip` component

**Files:**
- Create: `client/src/components/BadgeStrip.tsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/BadgeStrip.tsx`:

```tsx
import type { BadgeKind } from '@shared/types';

type BadgeMeta = { emoji: string; tooltip: string };

const META: Record<BadgeKind, BadgeMeta> = {
  bingo: { emoji: '🎯', tooltip: 'Бинго — все 7 фишек за один ход' },
  longWord: { emoji: '📏', tooltip: 'Длинное слово — 7 букв и больше' },
  bigMove: { emoji: '💥', tooltip: 'Крупный ход — 50 очков и больше' },
  helper: { emoji: '🤝', tooltip: 'Помощник — больше всего подсказок' },
  gold: { emoji: '🥇', tooltip: 'Золото — первое место' },
  silver: { emoji: '🥈', tooltip: 'Серебро — второе место' },
  bronze: { emoji: '🥉', tooltip: 'Бронза — третье место' },
};

const ORDER: BadgeKind[] = ['gold', 'silver', 'bronze', 'bingo', 'longWord', 'bigMove', 'helper'];

type Props = { badges: BadgeKind[] };

export function BadgeStrip({ badges }: Props) {
  if (badges.length === 0) return null;
  const counts = new Map<BadgeKind, number>();
  for (const b of badges) counts.set(b, (counts.get(b) ?? 0) + 1);

  const ordered = ORDER.filter((k) => counts.has(k));

  return (
    <div className="mt-1 flex flex-wrap gap-1 text-base leading-none">
      {ordered.map((k) => {
        const n = counts.get(k)!;
        const meta = META[k];
        return (
          <span key={k} title={meta.tooltip} className="badge-pop inline-flex items-center">
            <span aria-label={meta.tooltip}>{meta.emoji}</span>
            {n >= 2 && <span className="ml-0.5 text-xs tabular-nums">×{n}</span>}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BadgeStrip.tsx
git commit -m "feat(client): BadgeStrip component for per-player badges"
```

---

## Task 9: CSS keyframes for badge pop and confetti

**Files:**
- Modify: `client/src/styles/index.css`

- [ ] **Step 1: Inspect existing CSS**

Read `client/src/styles/index.css` to find the existing keyframes (e.g., score-pop, tile-flash). Match their style and indentation.

- [ ] **Step 2: Append keyframes**

Append the following at the end of `client/src/styles/index.css`:

```css
@keyframes badge-pop-kf {
  0%   { transform: scale(0.5); opacity: 0; }
  60%  { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1.0); opacity: 1; }
}
.badge-pop {
  animation: badge-pop-kf 280ms ease-out both;
}

@keyframes confetti-fall {
  0%   { transform: translate3d(var(--cx, 0), -20vh, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate3d(calc(var(--cx, 0) + var(--dx, 0)), 110vh, 0) rotate(540deg); opacity: 0; }
}
.confetti-piece {
  position: absolute;
  top: 0;
  left: 50%;
  width: 8px;
  height: 12px;
  border-radius: 2px;
  animation: confetti-fall 2000ms cubic-bezier(0.2, 0.5, 0.8, 1) forwards;
  pointer-events: none;
}

@keyframes celebration-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.celebration-backdrop {
  animation: celebration-fade-in 220ms ease-out both;
}

@keyframes celebration-name-in {
  0%   { transform: translateY(20px) scale(0.9); opacity: 0; }
  100% { transform: translateY(0)    scale(1.0); opacity: 1; }
}
.celebration-name {
  animation: celebration-name-in 500ms ease-out both;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/styles/index.css
git commit -m "feat(client): keyframes for badge pop, confetti, celebration overlay"
```

---

## Task 10: Wire `BadgeStrip` into `PlayerCard`

**Files:**
- Modify: `client/src/components/PlayerCard.tsx`

- [ ] **Step 1: Import and compute live badges**

Add this import near the top of the file (with the other imports):

```ts
import { BadgeStrip } from './BadgeStrip.js';
import { perMoveBadges, endGameBadges } from '@server/badges.js';
import type { BadgeKind, Slot } from '@shared/types';
```

Inside the `PlayerCard` component body, after the existing `useGameStore` calls and before the `return`, add:

```ts
const allEvents = useGameStore((s) => s.state?.events ?? []);
const phase = useGameStore((s) => s.state?.phase ?? 'waiting');

const badges: BadgeKind[] = (() => {
  const live: BadgeKind[] = [];
  for (const e of allEvents) {
    if (e.kind === 'move' && e.slot === player.slot) {
      live.push(...perMoveBadges(e));
    }
  }
  if (phase !== 'finished') return live;
  const scores: Record<Slot, number> = {
    0: allPlayers[0]?.score ?? 0,
    1: allPlayers[1]?.score ?? 0,
    2: allPlayers[2]?.score ?? 0,
  };
  const end = endGameBadges(allEvents, scores)[player.slot];
  return [...end, ...live];
})();
```

- [ ] **Step 2: Render the strip below the name row**

Locate the existing `<div className="mb-2 flex items-baseline justify-between">…</div>` block. Immediately after that closing `</div>`, insert:

```tsx
<BadgeStrip badges={badges} />
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
Open three browser tabs to `http://localhost:5173/?slot=0&name=A`, `?slot=1&name=B`, `?slot=2&name=C`. Play a move that triggers a badge (or place a manual rack to score 50+). Confirm the badge appears live on the correct PlayerCard with the right tooltip on hover. Stop the dev server when done.

- [ ] **Step 4: Typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/PlayerCard.tsx
git commit -m "feat(client): live badges on PlayerCard"
```

---

## Task 11: `GameEndCelebration` overlay component

**Files:**
- Create: `client/src/components/GameEndCelebration.tsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/GameEndCelebration.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { GameState, Slot } from '@shared/types';
import { endGameBadges } from '@server/badges.js';

type Props = {
  state: GameState;
  onDismiss: () => void;
};

const CONFETTI_COUNT = 36;
const AUTO_DISMISS_MS = 6000;

export function GameEndCelebration({ state, onDismiss }: Props) {
  const [scoreShown, setScoreShown] = useState(0);
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0]!;

  const scores: Record<Slot, number> = {
    0: state.players[0].score,
    1: state.players[1].score,
    2: state.players[2].score,
  };
  const badgesBySlot = endGameBadges(state.events, scores);

  useEffect(() => {
    const start = performance.now();
    const duration = 800;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setScoreShown(Math.round(winner.score * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const dismissTimer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(dismissTimer);
    };
  }, [winner.score, onDismiss]);

  return (
    <div
      role="dialog"
      aria-label="Игра окончена"
      onClick={onDismiss}
      className="celebration-backdrop fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 text-white"
    >
      <div className="relative flex flex-col items-center">
        <div className="celebration-name text-5xl font-bold tracking-tight">{winner.name}</div>
        <div className="mt-2 text-3xl tabular-nums">{scoreShown}</div>

        <ol className="mt-8 w-72 space-y-2">
          {sorted.map((p, i) => {
            const placeBadge = badgesBySlot[p.slot].find((b) => b === 'gold' || b === 'silver' || b === 'bronze');
            const helper = badgesBySlot[p.slot].includes('helper');
            const emoji = placeBadge === 'gold' ? '🥇' : placeBadge === 'silver' ? '🥈' : placeBadge === 'bronze' ? '🥉' : '';
            return (
              <li
                key={p.slot}
                className="badge-pop flex items-center justify-between rounded bg-white/10 px-3 py-2"
                style={{ animationDelay: `${500 + i * 250}ms` }}
              >
                <span className="flex items-center gap-2">
                  <span className="text-2xl">{emoji}</span>
                  <span>{p.name}</span>
                  {helper && <span title="Помощник — больше всего подсказок">🤝</span>}
                </span>
                <span className="font-mono tabular-nums">{p.score}</span>
              </li>
            );
          })}
        </ol>

        {Array.from({ length: CONFETTI_COUNT }).map((_, i) => {
          const cx = `${(Math.random() * 60 - 30).toFixed(1)}vw`;
          const dx = `${(Math.random() * 40 - 20).toFixed(1)}vw`;
          const delay = `${Math.floor(Math.random() * 400)}ms`;
          const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7'];
          const color = colors[i % colors.length];
          const style = { ['--cx' as string]: cx, ['--dx' as string]: dx, animationDelay: delay, background: color } as React.CSSProperties;
          return <span key={i} className="confetti-piece" style={style} />;
        })}
      </div>
      <p className="mt-10 text-sm text-white/70">нажмите, чтобы продолжить</p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/GameEndCelebration.tsx
git commit -m "feat(client): GameEndCelebration overlay (winner reveal + confetti)"
```

---

## Task 12: Wire `GameEndCelebration` into the app

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Inspect App.tsx**

Read `client/src/App.tsx`. Locate where `FinishedScreen` is rendered (the conditional `phase === 'finished'`).

- [ ] **Step 2: Add celebration state**

In `App.tsx`, add a `useState` and `useEffect` to fire the celebration on the first transition into `finished`. Above the JSX:

```tsx
import { useEffect, useState, useRef } from 'react';
import { GameEndCelebration } from './components/GameEndCelebration.js';

// inside the component:
const phase = state?.phase;
const [celebrationOpen, setCelebrationOpen] = useState(false);
const prevPhase = useRef(phase);
useEffect(() => {
  if (prevPhase.current !== 'finished' && phase === 'finished') {
    setCelebrationOpen(true);
  }
  prevPhase.current = phase;
}, [phase]);
```

(Keep the existing imports; add only the new ones. Reuse `useState` / `useEffect` / `useRef` if already imported.)

- [ ] **Step 3: Render the celebration above the FinishedScreen**

Where `FinishedScreen` is rendered, render `GameEndCelebration` *in addition* (not as a replacement) when `celebrationOpen` is true:

```tsx
{phase === 'finished' && state !== null && (
  <>
    <FinishedScreen state={state} />
    {celebrationOpen && (
      <GameEndCelebration state={state} onDismiss={() => setCelebrationOpen(false)} />
    )}
  </>
)}
```

The celebration sits above (`z-50` + rendered after) and dismisses to reveal the FinishedScreen behind it.

- [ ] **Step 4: Verify in browser**

Run: `npm run dev`. Reach a finished state (use the demo helpers or end a quick game manually). Confirm: celebration overlay appears once on transition; tapping dismisses; page reload after dismissal does NOT replay the celebration; FinishedScreen "Новая игра" still works.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(client): show GameEndCelebration on first transition to finished"
```

---

## Task 13: Wire `BadgeStrip` into `PastGamesDetail`

**Files:**
- Modify: `client/src/components/PastGamesDetail.tsx`

- [ ] **Step 1: Compute and render badges per player**

In `PastGamesDetail.tsx`, add imports:

```ts
import { BadgeStrip } from './BadgeStrip.js';
import { perMoveBadges, endGameBadges } from '@server/badges.js';
import type { BadgeKind, Slot } from '@shared/types';
```

Below the `players` mapping (before the `return`), compute:

```ts
const scoresMap: Record<Slot, number> = {
  0: archive.players.find((p) => p.slot === 0)?.finalScore ?? 0,
  1: archive.players.find((p) => p.slot === 1)?.finalScore ?? 0,
  2: archive.players.find((p) => p.slot === 2)?.finalScore ?? 0,
};
const endBadges = endGameBadges(archive.events, scoresMap);

const perPlayerBadges: Record<Slot, BadgeKind[]> = { 0: [], 1: [], 2: [] };
for (const slot of [0, 1, 2] as const) {
  const live: BadgeKind[] = [];
  for (const e of archive.events) {
    if (e.kind === 'move' && e.slot === slot) live.push(...perMoveBadges(e));
  }
  perPlayerBadges[slot] = [...endBadges[slot], ...live];
}
```

In the existing `<ul>` listing players, change each `<li>` to render the badges below the name+score line:

```tsx
<li key={p.slot} className={archive.winnerSlot === p.slot ? 'font-semibold' : ''}>
  <div>{p.name} — <span className="tabular-nums">{p.finalScore}</span></div>
  <BadgeStrip badges={perPlayerBadges[p.slot]} />
</li>
```

- [ ] **Step 2: Typecheck and visual check**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run dev`. Open Past Games, pick a finished game, confirm badge strip renders alongside each player and matches what was shown live during play.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PastGamesDetail.tsx
git commit -m "feat(client): badges in Past Games viewer"
```

---

## Task 14: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: All tests PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (root + client).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Vite build succeeds, no type errors.

- [ ] **Step 4: Manual UI smoke**

Run: `npm run dev`. Walk through:
- Trigger a `bigMove` (50+ point move) — confirm 💥 appears live on the playing card.
- Trigger a `bingo` — confirm 🎯 appears live.
- Trigger a `longWord` — confirm 📏 appears live.
- End the game with distinct scores — confirm celebration plays, gold/silver/bronze appear in the right places, confetti only plays once, tap dismisses overlay, FinishedScreen shows full badge strip.
- Open the same game from "Past Games" — confirm badges match.
- End a game with a 1st-place tie — confirm two golds, no silver, one bronze.

- [ ] **Step 5: Update spec status**

In `docs/superpowers/specs/2026-04-30-scrabble-design.md`, the M6 milestone bullet (around line 273) — append a sub-bullet noting M6a is complete:

```md
   - **M6a** (see `docs/superpowers/specs/2026-05-02-m6a-gamification-design.md`): per-game badges + game-end celebration. ✅
   - **M6b**: cross-game leaderboard + cumulative achievements (deferred).
```

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/specs/2026-04-30-scrabble-design.md
git commit -m "docs(spec): mark M6a complete; M6b deferred"
```
