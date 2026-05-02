# M5b — Polish & Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the five M5b polish slices and deploy to Render: tile-flash + score-popup animations, real Russian dictionary advisory, "Новая игра" flow with draw-for-order, disconnect indicator badge, and a production deploy.

**Architecture:** Five mostly-independent slices. Engine changes (dictionary warnings on `MoveRecord`, draw-for-order in `startGame`) flow through the existing snapshot broadcast. Client polish is CSS-only animations + a new `FinishedScreen` overlay. Deploy uses a single Render web service serving the bundled client + WS endpoint on one port — no infra split.

**Tech Stack:** TypeScript (strict), Node 20, Vitest, React 19, Tailwind 4, Express + ws, tsx runtime, Render free tier.

**Spec:** `docs/superpowers/specs/2026-05-01-m5b-design.md`

---

## File Structure

**Engine/server (slice 2 — dictionary):**
- Modify `shared/types.ts` — add `dictionaryWarnings` to `MoveRecord`.
- Modify `server/dictionary.ts` — replace stub with real Set-based lookup + Ё/Ъ normalization.
- Modify `server/game.ts` — populate `MoveRecord.dictionaryWarnings`.
- Modify `server/persistence.ts` — back-fill missing field on legacy records.
- Create `scripts/build-dictionary.ts` — one-shot OpenCorpora extractor.
- Create `server/data/nouns.txt` — committed output, sorted UTF-8.

**Engine/server (slice 3 — newGame + draw-for-order):**
- Modify `shared/types.ts` — add `DrawForOrderRecord`, `newGame` client message.
- Modify `server/game.ts` — `startGame()` runs draw-for-order before dealing racks.
- Modify `server/index.ts` — handle `newGame` message.
- Modify `server/letters.ts` — add `compareLetterOrder` helper.

**Client (slice 1 — animations):**
- Modify `client/src/store.ts` — `lastPlacedCells`, `lastPlacedAt`.
- Modify `client/src/ws.ts` — set those on `state` arrival when last event is a fresh move.
- Modify `client/src/components/Square.tsx` — apply `tile-flash` class.
- Modify `client/src/components/PlayerCard.tsx` — score popup + (slice 4) connection badge.
- Modify `client/src/styles/index.css` — `tile-flash` and `score-pop` keyframes.

**Client (slice 3 — finished + draw-for-order UI):**
- Create `client/src/components/FinishedScreen.tsx`.
- Modify `client/src/components/MoveLog.tsx` — render `drawForOrder` event entry.
- Modify `client/src/App.tsx` — mount `FinishedScreen` when `phase === 'finished'`, draw-for-order banner.
- Modify `client/src/ws.ts` — `sendNewGame()`.

**Client (slice 4 — disconnect indicator):**
- Already covered by `PlayerCard` modification above.

**Deploy (slice 5):**
- Create `render.yaml`.
- Modify `package.json` — move `tsx` from `devDependencies` to `dependencies`.
- Modify `README.md` — cold-start + ephemeral data note.

---

## Slice 1 — Animations

### Task 1.1: Store fields for last-placed cells

**Files:**
- Modify: `client/src/store.ts`
- Modify: `client/src/ws.ts`

- [ ] **Step 1: Add fields to the store**

In `client/src/store.ts`, extend the store state with:

```ts
lastPlacedCells: { row: number; col: number }[];
lastPlacedAt: number; // ms epoch
```

Initialize both to `[]` and `0`. Add a setter:

```ts
setLastPlaced: (cells: { row: number; col: number }[], at: number) => void;
```

with implementation `set({ lastPlacedCells: cells, lastPlacedAt: at })`.

- [ ] **Step 2: Detect fresh moves on snapshot arrival**

In `client/src/ws.ts`, inside `case 'state'`, after `store.setState(msg.state)`, compute whether the most recent event is a fresh `MoveRecord`:

```ts
const events = msg.state.events;
const last = events[events.length - 1];
const FRESH_MS = 5000;
if (last !== undefined && last.kind === 'move' && Date.now() - last.timestamp < FRESH_MS) {
  const cells = last.placements.map((p) => ({ row: p.row, col: p.col }));
  useGameStore.getState().setLastPlaced(cells, Date.now());
}
```

A `RevertRecord` (most recent event with `kind === 'revert'`) naturally falls through and does not flash.

- [ ] **Step 3: Commit**

```bash
git add client/src/store.ts client/src/ws.ts
git commit -m "feat(client): track last-placed cells for tile-flash animation"
```

### Task 1.2: Tile flash CSS + Square wiring

**Files:**
- Modify: `client/src/styles/index.css`
- Modify: `client/src/components/Square.tsx`

- [ ] **Step 1: Add the keyframe**

In `client/src/styles/index.css`, append:

```css
@keyframes tile-flash {
  0%   { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.0); transform: scale(1); }
  20%  { box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.9); transform: scale(1.06); }
  100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.0); transform: scale(1); }
}
.tile-flash { animation: tile-flash 1.2s ease-out 1; }
```

- [ ] **Step 2: Apply class in Square**

In `client/src/components/Square.tsx`, read `lastPlacedCells` and `lastPlacedAt` from the store. If the square's `(row, col)` is in `lastPlacedCells` AND `Date.now() - lastPlacedAt < 1200`, add the `tile-flash` class to the rendered tile element.

The store value is read once per render; that's fine — Zustand's selector triggers re-render on snapshot change, which is exactly when we want to start the animation.

- [ ] **Step 3: Manual verify**

Run `npm run dev`. Open three browser tabs and play one move. The newly-placed tile(s) should flash yellow briefly.

- [ ] **Step 4: Commit**

```bash
git add client/src/styles/index.css client/src/components/Square.tsx
git commit -m "feat(client): tile-flash animation on newly-placed cells"
```

### Task 1.3: Score popup

**Files:**
- Modify: `client/src/styles/index.css`
- Modify: `client/src/components/PlayerCard.tsx`

- [ ] **Step 1: Add the keyframe**

Append to `client/src/styles/index.css`:

```css
@keyframes score-pop {
  0%   { opacity: 0; transform: translateY(0); }
  10%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(-2rem); }
}
.score-pop {
  position: absolute;
  pointer-events: none;
  animation: score-pop 1.5s ease-out forwards;
  font-weight: 700;
  color: rgb(22, 163, 74);
}
```

- [ ] **Step 2: Mount transient popup in PlayerCard**

In `client/src/components/PlayerCard.tsx`, track previous score in a ref. When score increases, render a popup span keyed by `Date.now()` so it auto-unmounts on next score change:

```tsx
const prevScoreRef = useRef(player.score);
const [pop, setPop] = useState<{ key: number; delta: number } | null>(null);
useEffect(() => {
  if (player.score > prevScoreRef.current) {
    setPop({ key: Date.now(), delta: player.score - prevScoreRef.current });
  }
  prevScoreRef.current = player.score;
}, [player.score]);
```

In JSX, ensure the card root is `relative`, then conditionally render:

```tsx
{pop !== null && (
  <span key={pop.key} className="score-pop right-2 top-2">+{pop.delta}</span>
)}
```

- [ ] **Step 3: Manual verify**

Run dev server, play a move. The active player's card should briefly show `+N` floating up.

- [ ] **Step 4: Commit**

```bash
git add client/src/styles/index.css client/src/components/PlayerCard.tsx
git commit -m "feat(client): score popup animation on PlayerCard"
```

---

## Slice 2 — Dictionary advisory

### Task 2.1: Build the noun list (one-shot)

**Files:**
- Create: `scripts/build-dictionary.ts`
- Create: `server/data/nouns.txt`

- [ ] **Step 1: Source the OpenCorpora dump**

Download `dict.opcorpora.xml.bz2` from `https://opencorpora.org/?page=downloads` to a scratch location (do NOT commit the dump itself — only the filtered output). Decompress to `dict.opcorpora.xml`.

- [ ] **Step 2: Write the extractor script**

Create `scripts/build-dictionary.ts`:

```ts
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const SOURCE = process.argv[2];
const OUT = process.argv[3] ?? 'server/data/nouns.txt';
if (!SOURCE) { console.error('usage: tsx scripts/build-dictionary.ts <dict.opcorpora.xml> [out]'); process.exit(1); }

const EXCLUDE = new Set(['Geox', 'Name', 'Surn', 'Patr', 'Abbr', 'Trad', 'Init']);

async function main() {
  const lemmas = new Set<string>();
  const rl = createInterface({ input: createReadStream(SOURCE, 'utf-8'), crlfDelay: Infinity });
  let inLemma = false, isNoun = false, excluded = false, currentLemma: string | null = null;
  for await (const raw of rl) {
    const line = raw.trim();
    if (line.startsWith('<lemma ')) { inLemma = true; isNoun = false; excluded = false; currentLemma = null; continue; }
    if (line === '</lemma>') {
      if (inLemma && isNoun && !excluded && currentLemma) lemmas.add(currentLemma.toUpperCase());
      inLemma = false; continue;
    }
    if (!inLemma) continue;
    // The first <l t="..."> line in a lemma block is the dictionary form (nominative singular for nouns).
    if (currentLemma === null) {
      const m = line.match(/^<l t="([^"]+)"/);
      if (m) currentLemma = m[1]!;
    }
    // Grammeme tags appear as <g v="NOUN"/> etc.
    const g = line.match(/^<g v="([^"]+)"/);
    if (g) {
      const v = g[1]!;
      if (v === 'NOUN') isNoun = true;
      if (EXCLUDE.has(v)) excluded = true;
    }
  }
  const sorted = [...lemmas].filter((w) => /^[А-ЯЁ]+$/.test(w)).sort();
  writeFileSync(OUT, sorted.join('\n') + '\n', 'utf-8');
  console.log(`wrote ${sorted.length} lemmas to ${OUT}`);
}
main();
```

- [ ] **Step 3: Run the extractor**

```bash
npx tsx scripts/build-dictionary.ts /path/to/dict.opcorpora.xml server/data/nouns.txt
```

Expected: ~80k–120k lemmas written.

- [ ] **Step 4: Spot-check the output**

```bash
head -20 server/data/nouns.txt
grep -c '^КОТ$' server/data/nouns.txt    # expect 1
grep -c '^ЛЕВ$' server/data/nouns.txt    # expect 1 (common noun "lion")
grep -c '^МОСКВА$' server/data/nouns.txt # expect 0 (Geox excluded)
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-dictionary.ts server/data/nouns.txt
git commit -m "feat(dictionary): build script + OpenCorpora-derived noun list"
```

### Task 2.2: Real `checkWords` with normalization

**Files:**
- Modify: `server/dictionary.ts`
- Modify: `tests/dictionary.test.ts`

- [ ] **Step 1: Write failing tests**

Replace `tests/dictionary.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { checkWords } from '../server/dictionary.js';

describe('checkWords', () => {
  it('returns empty for known nouns', () => {
    expect(checkWords(['КОТ'])).toEqual([]);
  });
  it('flags unknown words', () => {
    expect(checkWords(['ЯБЛЫРГ'])).toEqual(['ЯБЛЫРГ']);
  });
  it('accepts both ЁЛКА and ЕЛКА', () => {
    expect(checkWords(['ЁЛКА'])).toEqual([]);
    expect(checkWords(['ЕЛКА'])).toEqual([]);
  });
  it('case-insensitive on input', () => {
    expect(checkWords(['кот'])).toEqual([]);
  });
});
```

Run: `npm test -- dictionary`. Expected: tests fail (stub returns `[]` for unknown, fails the "flags unknown" assertion).

- [ ] **Step 2: Implement the lookup**

Replace `server/dictionary.ts`:

```ts
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function normalize(w: string): string {
  return w.toUpperCase().replace(/Ё/g, 'Е').replace(/Ъ/g, 'Ь');
}

let knownRaw: Set<string> | null = null;
let knownNormalized: Set<string> | null = null;

function load(): void {
  if (knownRaw !== null) return;
  // Resolve relative to the compiled module location.
  const candidates = [
    path.resolve(process.cwd(), 'server/data/nouns.txt'),
    path.resolve(import.meta.dirname ?? '.', 'data/nouns.txt'),
  ];
  const file = candidates.find((c) => existsSync(c));
  if (!file) {
    console.warn('[dictionary] nouns.txt not found; advisory disabled');
    knownRaw = new Set();
    knownNormalized = new Set();
    return;
  }
  const lines = readFileSync(file, 'utf-8').split('\n').filter((l) => l.length > 0);
  knownRaw = new Set(lines.map((l) => l.toUpperCase()));
  knownNormalized = new Set([...knownRaw].map(normalize));
}

export function checkWords(words: string[]): string[] {
  load();
  const unknown: string[] = [];
  for (const w of words) {
    const upper = w.toUpperCase();
    if (knownRaw!.has(upper)) continue;
    if (knownNormalized!.has(normalize(upper))) continue;
    unknown.push(upper);
  }
  return unknown;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- dictionary`. Expected: all pass.

- [ ] **Step 4: Run full suite**

Run: `npm run typecheck && npm test`. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add server/dictionary.ts tests/dictionary.test.ts
git commit -m "feat(dictionary): real lookup with Ё/Ъ substitution-aware normalization"
```

### Task 2.3: Persist `dictionaryWarnings` on `MoveRecord`

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/game.ts`
- Modify: `server/persistence.ts`
- Modify: `tests/persistence.test.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Extend the type**

In `shared/types.ts`, add to `MoveRecord`:

```ts
export type MoveRecord = {
  // ...existing fields...
  dictionaryWarnings: string[];
};
```

- [ ] **Step 2: Set the field at move time**

In `server/game.ts`, find the `submitMove` block where `moveRecord` is constructed (around line 119) and where `dictionaryWarnings` is computed (around line 149). Move `dictionaryWarnings` computation before the record is finalized, and include it on the record:

```ts
const dictionaryWarnings = checkWords(words.map((w) => w.word));
const moveRecord: MoveRecord = {
  // ...existing fields...
  dictionaryWarnings,
};
```

The transient field on the `{ ok: true, ... }` return value stays for backwards-compat with existing client behavior.

- [ ] **Step 3: Back-fill on load**

In `server/persistence.ts`, in `loadActiveGame`, after the existing `events` migration:

```ts
if (Array.isArray(raw.events)) {
  for (const ev of raw.events as GameEvent[]) {
    if (ev.kind === 'move' && (ev as Partial<MoveRecord>).dictionaryWarnings === undefined) {
      (ev as MoveRecord).dictionaryWarnings = [];
    }
  }
}
```

Apply the same back-fill in `loadArchive` for both shapes (legacy `{ summary, state }` and flat `GameArchive`). Lift to a helper `backfillEvents(events: GameEvent[]): void` to avoid repetition.

- [ ] **Step 4: Test the round-trip**

Add to `tests/persistence.test.ts`:

```ts
it('round-trips MoveRecord.dictionaryWarnings', () => {
  // Save a state containing a move with warnings, load it back, assert warnings preserved.
});
it('back-fills missing dictionaryWarnings as []', () => {
  // Write a JSON file with a move event lacking the field, load it, assert dictionaryWarnings === [].
});
```

- [ ] **Step 5: Verify game tests**

Run: `npm test`. Expected: green. Existing `game.test.ts` assertions on `MoveRecord` shape may fail — fix any that compare full record equality by adding `dictionaryWarnings: []` to expected values.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts server/game.ts server/persistence.ts tests/persistence.test.ts tests/game.test.ts
git commit -m "feat(engine): persist dictionaryWarnings on MoveRecord"
```

### Task 2.4: Render warnings in MoveLog

**Files:**
- Modify: `client/src/components/MoveLog.tsx`

- [ ] **Step 1: Add rendering**

In `client/src/components/MoveLog.tsx`, in the `case 'move'` branch, after the existing rendering, append (when `dictionaryWarnings.length > 0`):

```tsx
{ev.dictionaryWarnings.length > 0 && (
  <span className="ml-2 text-xs text-amber-700/80">
    (не в словаре: {ev.dictionaryWarnings.join(', ')})
  </span>
)}
```

- [ ] **Step 2: Manual verify**

Run dev server. Place an unknown word — it appears in MoveLog with the muted warning. Past Games detail (renders the same MoveLog) shows it too.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/MoveLog.tsx
git commit -m "feat(client): show dictionary warnings inline in MoveLog"
```

---

## Slice 3 — Новая игра + draw-for-order

### Task 3.1: `compareLetterOrder` helper

**Files:**
- Modify: `server/letters.ts`
- Modify: `tests/letters.test.ts`

- [ ] **Step 1: Failing test**

Add to `tests/letters.test.ts`:

```ts
import { compareLetterOrder } from '../server/letters.js';
describe('compareLetterOrder', () => {
  it('null (blank) beats any letter', () => {
    expect(compareLetterOrder(null, 'А')).toBeLessThan(0);
    expect(compareLetterOrder('А', null)).toBeGreaterThan(0);
  });
  it('orders by alphabet position', () => {
    expect(compareLetterOrder('А', 'Б')).toBeLessThan(0);
    expect(compareLetterOrder('Я', 'А')).toBeGreaterThan(0);
  });
  it('equal letters tie', () => {
    expect(compareLetterOrder('К', 'К')).toBe(0);
  });
});
```

Run: `npm test -- letters`. Expected: fail (function undefined).

- [ ] **Step 2: Implement**

In `server/letters.ts`, add (using the existing `RUSSIAN_ALPHABET` constant if present, else build it):

```ts
const ORDER = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
export function compareLetterOrder(a: Letter | null, b: Letter | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1; // blank wins (closer to А)
  if (b === null) return 1;
  return ORDER.indexOf(a) - ORDER.indexOf(b);
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- letters`. Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add server/letters.ts tests/letters.test.ts
git commit -m "feat(letters): compareLetterOrder for draw-for-order"
```

### Task 3.2: `DrawForOrderRecord` event type

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add the type**

In `shared/types.ts`:

```ts
export type DrawForOrderRecord = {
  kind: 'drawForOrder';
  draws: { slot: Slot; letter: Letter | null }[]; // null = blank; one per player in slot order
  firstSlot: Slot;
  timestamp: number;
};
```

Add `DrawForOrderRecord` to the `GameEvent` union and `'drawForOrder'` falls out into `GameEventKind` automatically.

- [ ] **Step 2: Add `newGame` client message**

In `shared/types.ts`, extend the `ClientMessage` union with `{ type: 'newGame' }`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`. Expect failures in any switch over `GameEvent` that doesn't handle `drawForOrder` — note them, will be fixed in next tasks.

- [ ] **Step 4: Commit (with type errors — fixed in next tasks)**

Skip commit; fold into Task 3.3 commit.

### Task 3.3: `startGame` runs draw-for-order

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Failing tests**

Add to `tests/game.test.ts`:

```ts
describe('startGame draw-for-order', () => {
  it('emits a DrawForOrderRecord as the first event', () => {
    const g = new Game({ seed: 12345 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    const events = g.snapshot().events;
    expect(events[0]?.kind).toBe('drawForOrder');
  });
  it('sets turnIndex to firstSlot', () => {
    const g = new Game({ seed: 12345 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    const snap = g.snapshot();
    const first = (snap.events[0] as DrawForOrderRecord).firstSlot;
    expect(snap.turnIndex).toBe(first);
  });
  it('returns drawn tiles to bag (full 7-tile racks dealt)', () => {
    const g = new Game({ seed: 12345 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    const snap = g.snapshot();
    const totalRacks = snap.players.reduce((s, p) => s + p.rack.length, 0);
    expect(totalRacks).toBe(21);
    expect(snap.bag.length).toBe(104 - 21);
  });
});
```

Run: fail.

- [ ] **Step 2: Implement in `Game.startGame`**

Replace the body of `startGame()` in `server/game.ts`:

```ts
startGame(): void {
  if (!this.state.players.every((p) => p.connected)) {
    throw new Error('Cannot start until all three slots are connected');
  }
  // 1. Each player draws one tile.
  let candidates: Slot[] = [0, 1, 2];
  let firstSlot: Slot;
  let firstDraws: { slot: Slot; letter: Letter | null }[] = [];
  while (true) {
    const drawn = candidates.map((s) => ({ slot: s, tile: drawTiles(this.bag, 1)[0]! }));
    if (firstDraws.length === 0) {
      firstDraws = drawn.map((d) => ({ slot: d.slot, letter: d.tile.letter }));
    }
    drawn.sort((a, b) => compareLetterOrder(a.tile.letter, b.tile.letter));
    const best = drawn[0]!;
    const tied = drawn.filter((d) => compareLetterOrder(d.tile.letter, best.tile.letter) === 0);
    // Return all drawn tiles to the bag.
    for (const d of drawn) returnTilesToBag(this.bag, [d.tile]);
    if (tied.length === 1) { firstSlot = best.slot; break; }
    candidates = tied.map((d) => d.slot);
  }
  // 2. Reshuffle. (Bag's RNG is the engine's seeded RNG; no extra arg needed.)
  shuffleBag(this.bag);
  // 3. Deal 7 tiles to each player.
  for (const p of this.state.players) {
    const drawn = drawTiles(this.bag, 7);
    addTilesToRack(p.rack, drawn);
  }
  // 4. Record the draw-for-order event.
  this.state.events.push({
    kind: 'drawForOrder',
    draws: firstDraws,
    firstSlot,
    timestamp: Date.now(),
  });
  this.state.turnIndex = firstSlot;
  this.state.phase = 'playing';
  this.state.bag = this.bag.tiles;
  this.state.startedAt = Date.now();
}
```

You may need to add `returnTilesToBag` and `shuffleBag` helpers in `server/bag.ts` if they don't already exist:

```ts
export function returnTilesToBag(bag: Bag, tiles: Tile[]): void {
  bag.tiles.push(...tiles);
}
export function shuffleBag(bag: Bag): void {
  // Fisher-Yates with the bag's seeded RNG.
  for (let i = bag.tiles.length - 1; i > 0; i--) {
    const j = Math.floor(bag.rng() * (i + 1));
    [bag.tiles[i], bag.tiles[j]] = [bag.tiles[j]!, bag.tiles[i]!];
  }
}
```

(Check existing bag API first — `drawTiles` already encapsulates RNG; reuse the existing pattern. If `Bag` doesn't expose `rng`, expose it minimally.)

- [ ] **Step 3: Run tests**

Run: `npm test -- game`. Expected: pass.

- [ ] **Step 4: Run full suite**

Run: `npm run typecheck && npm test`. Some pre-existing tests that asserted `turnIndex === 0` after `startGame` will now fail — update them to read `turnIndex` from the snapshot's `firstSlot` event, or use a fixed seed and assert the deterministic firstSlot for that seed.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts server/game.ts server/bag.ts server/letters.ts tests/game.test.ts tests/bag.test.ts
git commit -m "feat(engine): draw-for-order routine in startGame"
```

### Task 3.4: Server `newGame` handler

**Files:**
- Modify: `server/index.ts`
- Create: `tests/server-newgame.test.ts`

- [ ] **Step 1: Add the handler**

In `server/index.ts`, in `attachInGameHandler`'s switch, add:

```ts
case 'newGame': {
  if (game !== null) return; // ignore if game already exists (race)
  if (!allSeated(seats)) {
    sendMsg(ws, { type: 'error', message: 'Не все игроки подключены' });
    return;
  }
  game = new Game({ seed: Date.now() });
  const names = namesInSlotOrder(seats);
  game.joinPlayer(0, names[0]);
  game.joinPlayer(1, names[1]);
  game.joinPlayer(2, names[2]);
  game.startGame();
  try { saveActiveGame(dataDir, game.snapshot()); } catch (err) { console.error(err); }
  broadcastState();
  return;
}
```

- [ ] **Step 2: Integration test**

Create `tests/server-newgame.test.ts` modeled on existing `tests/integration/*` patterns. Verify:
1. End game → `newGame` produces fresh snapshot (empty board, scores 0, events array starts with `drawForOrder`).
2. `newGame` while game is running is a no-op.
3. Two rapid `newGame` messages produce one game (second is ignored because `game !== null`).

If the existing integration harness is verbose, a minimal direct test using the server's exported test entry point (check existing integration tests for the pattern) is fine.

- [ ] **Step 3: Run**

Run: `npm test`. Expected: green.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts tests/server-newgame.test.ts
git commit -m "feat(server): newGame action restarts after finished phase"
```

### Task 3.5: `sendNewGame` client wire

**Files:**
- Modify: `client/src/ws.ts`

- [ ] **Step 1: Add sender**

In `client/src/ws.ts`, append:

```ts
export function sendNewGame(): void { send({ type: 'newGame' }); }
```

- [ ] **Step 2: Commit**

```bash
git add client/src/ws.ts
git commit -m "feat(client): sendNewGame wire"
```

### Task 3.6: `FinishedScreen` component

**Files:**
- Create: `client/src/components/FinishedScreen.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create the component**

`client/src/components/FinishedScreen.tsx`:

```tsx
import type { GameState } from '@shared/types';
import { sendNewGame } from '../ws.js';

export function FinishedScreen({ state, onShowPastGames }: { state: GameState; onShowPastGames: () => void }) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0]!;
  return (
    <div className="absolute inset-0 z-30 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-[28rem] max-w-[90vw] text-center">
        <div className="text-2xl font-bold mb-1">Игра окончена</div>
        <div className="text-lg mb-4">Победитель: <span className="font-semibold">{winner.name}</span> ({winner.score})</div>
        <ol className="mb-5 space-y-1">
          {sorted.map((p, i) => (
            <li key={p.slot} className="flex justify-between border-b border-ink/10 py-1">
              <span>{i + 1}. {p.name}</span>
              <span className="font-mono">{p.score}</span>
            </li>
          ))}
        </ol>
        <div className="flex gap-3 justify-center">
          <button className="px-4 py-2 rounded bg-emerald-600 text-white" onClick={() => sendNewGame()}>Новая игра</button>
          <button className="px-4 py-2 rounded border border-ink/30" onClick={onShowPastGames}>К списку игр</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount in App**

In `client/src/App.tsx`, replace the `Game over` text node with conditional `<FinishedScreen>` when `state.phase === 'finished'`. Wire `onShowPastGames` to whatever past-games-view toggle already exists.

- [ ] **Step 3: Manual verify**

Run dev. End a game (use `endGame` action). FinishedScreen appears, click "Новая игра" — fresh game starts on all three tabs.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/FinishedScreen.tsx client/src/App.tsx
git commit -m "feat(client): FinishedScreen with Новая игра button"
```

### Task 3.7: Render `drawForOrder` in MoveLog + banner

**Files:**
- Modify: `client/src/components/MoveLog.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: MoveLog entry**

In `MoveLog.tsx`, add a case for `'drawForOrder'`:

```tsx
case 'drawForOrder': {
  const draws = ev.draws.map((d) =>
    `${state.players[d.slot]?.name ?? '?'} — ${d.letter ?? '*'}`
  ).join(', ');
  const firstName = state.players[ev.firstSlot]?.name ?? '?';
  return <li key={i} className="text-ink/70">🎲 {draws}. Первой ходит {firstName}.</li>;
}
```

- [ ] **Step 2: Top-of-game banner (optional brief reveal)**

In `App.tsx`, when `state.phase === 'playing'` AND the most recent move-or-draw event is the first `drawForOrder` (no moves yet), render a dismissable banner above the board with the same text. Banner state held in a `useState`, cleared by either click or by next event arriving.

Keep it small — single `<div>` with a close button.

- [ ] **Step 3: Manual verify**

Start a fresh game. The MoveLog's first entry shows the draw result. The top banner appears once and dismisses.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/MoveLog.tsx client/src/App.tsx
git commit -m "feat(client): render drawForOrder in MoveLog + start-of-game banner"
```

---

## Slice 4 — Disconnect indicator

### Task 4.1: PlayerCard "не в сети" badge

**Files:**
- Modify: `client/src/components/PlayerCard.tsx`

- [ ] **Step 1: Add the badge**

In `PlayerCard.tsx`, when `player.connected === false` (the field already exists, set by server), render next to the name:

```tsx
{!player.connected && (
  <span className="ml-2 text-xs text-ink/50 inline-flex items-center gap-1">
    <span className="w-2 h-2 rounded-full bg-ink/40" />не в сети
  </span>
)}
```

Optionally apply a subtle opacity reduction (`className={... + (player.connected ? '' : ' opacity-70')}`) on the card root.

- [ ] **Step 2: Manual verify**

Run dev with three tabs. Close one tab. The other two tabs show the "не в сети" badge on that player's card. Reopen the closed tab — badge disappears.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PlayerCard.tsx
git commit -m "feat(client): не в сети badge on PlayerCard for disconnected players"
```

---

## Slice 5 — Deploy to Render

### Task 5.1: Move `tsx` to dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Edit**

Move the `tsx` entry from `devDependencies` to `dependencies` so `npm install --production` (Render's default) keeps it. Run `npm install` to regenerate the lockfile.

- [ ] **Step 2: Verify**

```bash
npm install
npm start  # quick smoke; Ctrl-C after seeing it bind :3000
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: move tsx to dependencies for production runtime"
```

### Task 5.2: `render.yaml`

**Files:**
- Create: `render.yaml`

- [ ] **Step 1: Write**

Create `render.yaml` at repo root:

```yaml
services:
  - type: web
    name: scrabble
    runtime: node
    plan: free
    nodeVersion: 20
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
    autoDeploy: true
```

- [ ] **Step 2: Commit**

```bash
git add render.yaml
git commit -m "chore(deploy): render.yaml for free-tier web service"
```

### Task 5.3: README cold-start + ephemeral note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a "Production / Render" section**

Add a short section noting:
- The deployed app cold-starts from sleep on free tier — first connect after idle takes ~30s.
- The `data/` directory is ephemeral across redeploys; in-progress games and history get wiped on each deploy. Family is expected to finish a game in one sitting.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README note on Render cold-start + ephemeral data"
```

### Task 5.4: Production smoke test

- [ ] **Step 1: Final pre-deploy check**

```bash
npm run typecheck && npm test && npm run build
```

Expected: all green; `client/dist/` populated.

- [ ] **Step 2: Push to remote**

```bash
git push origin feat/m5-polish
```

If `main` is the deployed branch, open a PR + merge after self-review.

- [ ] **Step 3: Manual verification on Render**

After Render reports a successful deploy:
1. Open the public URL in three browsers / family laptops.
2. Each picks a slot + name and joins.
3. Play through several turns including: a multi-spot move, a placement triggering a dictionary warning, a pass, and an `endGame` followed by `Новая игра`.
4. Confirm tile-flash + score-popup animations fire.
5. Disconnect one tab briefly — confirm badge appears and clears on reconnect.

- [ ] **Step 4: Done.**

---

## Self-Review Notes

Verify before declaring complete:

- [ ] Animations: tile-flash and score-pop both visible during a real move; revert does not flash; reload does not replay.
- [ ] Dictionary: at least one known word and one unknown word both seen with correct outcomes; `ЁЛКА`/`ЕЛКА` both accepted.
- [ ] Новая игра: end → restart cycle works; first event is `drawForOrder`; banner + log entry both appear.
- [ ] Disconnect badge: appears on socket close, clears on reconnect.
- [ ] Deploy: public URL responds; `wss://` upgrades; full game playable end-to-end.
- [ ] All tests pass: `npm run typecheck && npm test`.
