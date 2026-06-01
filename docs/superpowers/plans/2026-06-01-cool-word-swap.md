# Cool-Word Tile Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player on their turn trade one of their rack tiles for a chosen tile from an opponent who agrees, paying −5 while the giver earns +5, gated only by a self-declared 7+ letter "cool word".

**Architecture:** Server-authoritative, same as the rest of the engine. A new `pendingSwap: SwapOffer | null` field on `GameState` holds an outstanding offer; it rides the normal snapshot push and persists to `data/game.json`. Three new `Game` methods (`offerSwap`, `respondSwap`, `cancelSwap`) mutate state; three new WS messages (`offerSwap`, `respondSwap`, `cancelSwap`) wire the client. Completion logs a `SwapRecord`. Like the +5 helping hand, a completed swap does not touch the single-step undo machinery.

**Tech Stack:** TypeScript (strict, NodeNext), Vitest, React 19 + Zustand + Tailwind 4, `ws`.

**Spec:** `docs/superpowers/specs/2026-06-01-cool-word-swap-design.md`

---

## File Structure

- `shared/types.ts` — add `SwapOffer`, `SwapRecord`, `pendingSwap` on `GameState`, `SwapRecord` in `GameEvent`, three `ClientMessage` variants.
- `server/letters.ts` — add `countCyrillicLetters`.
- `server/game.ts` — add `SWAP_PHRASES`/`SWAP_MIN_WORD_LEN` consts, `offerSwap`/`respondSwap`/`cancelSwap`, `pendingSwap: null` in the constructor, clear `pendingSwap` in turn-ending actions, back-fill in `fromState`.
- `server/index.ts` — handle `offerSwap`/`respondSwap`/`cancelSwap`; add `pendingSwap: null` to `lobbySnapshot()`.
- `client/src/ws.ts` — `sendOfferSwap`/`sendRespondSwap`/`sendCancelSwap`.
- `client/src/components/SwapDialog.tsx` — NEW: offer modal (target + two tiles + word).
- `client/src/components/SwapBanner.tsx` — NEW: pending banner with celebratory phrase + accept/decline/cancel.
- `client/src/components/PlayerCard.tsx` — add "Обмен буквой" button that opens `SwapDialog`.
- `client/src/App.tsx` — mount `SwapBanner`.
- `client/src/components/MoveLog.tsx` — render the `swap` event.
- `tests/game.test.ts`, `tests/persistence.test.ts`, `tests/integration/m4b-server.test.ts` — tests.
- `docs/superpowers/specs/2026-04-30-scrabble-design.md` — add the House Rule row + file-layout entries.

---

## Task 1: Shared types + fix GameState literal constructors

Adding a required `pendingSwap` field to `GameState` breaks every place that builds a `GameState` literal. Add the types and fix the three constructors in the same task so the tree compiles.

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/game.ts:49-60` (constructor `this.state = {...}`)
- Modify: `server/index.ts:86-108` (`lobbySnapshot`)
- Modify: `tests/persistence.test.ts:16-36` (`sampleState`)

- [ ] **Step 1: Add the new types to `shared/types.ts`**

After the `ClaimBlankRecord` type (around line 77), add:

```ts
export type SwapOffer = {
  fromSlot: Slot;        // initiator (−5 on accept)
  toSlot: Slot;          // chosen giver (+5 on accept)
  giveTileId: string;    // initiator's tile → moves to target on accept
  takeTileId: string;    // target's tile → moves to initiator on accept
  word: string;          // declared cool word (≥ 7 Cyrillic letters)
  phrase: string;        // celebratory line chosen server-side
  createdAt: number;
};

export type SwapRecord = {
  kind: 'swap';
  fromSlot: Slot;
  toSlot: Slot;
  word: string;
  gaveLetter: Letter;    // letter the initiator gave away ('' for a blank)
  tookLetter: Letter;    // letter the initiator received ('' for a blank)
  timestamp: number;
};
```

Add `SwapRecord` to the `GameEvent` union:

```ts
export type GameEvent =
  | MoveRecord
  | AssistRecord
  | PassRecord
  | RedrawRecord
  | ClaimBlankRecord
  | EndGameRecord
  | DrawForOrderRecord
  | SwapRecord;
```

Add `pendingSwap` to `GameState` (after `drawState: DrawState | null;`):

```ts
  drawState: DrawState | null;
  pendingSwap: SwapOffer | null;
```

Add the three client messages to the `ClientMessage` union (after the `swapAll` line):

```ts
  | { type: 'offerSwap'; toSlot: Slot; giveTileId: string; takeTileId: string; word: string }
  | { type: 'respondSwap'; accept: boolean }
  | { type: 'cancelSwap' }
```

- [ ] **Step 2: Add `pendingSwap: null` to the `Game` constructor**

In `server/game.ts`, in the `this.state = { ... }` literal (ends ~line 60), add after `drawState: null,`:

```ts
      drawState: null,
      pendingSwap: null,
```

- [ ] **Step 3: Add `pendingSwap: null` to `lobbySnapshot()`**

In `server/index.ts`, in the returned object of `lobbySnapshot()` (ends ~line 107), add after `drawState: null,`:

```ts
      drawState: null,
      pendingSwap: null,
```

- [ ] **Step 4: Add `pendingSwap: null` to the persistence test's `sampleState`**

In `tests/persistence.test.ts`, in `sampleState()` (ends ~line 36), add after `drawState: null,`:

```ts
  drawState: null,
  pendingSwap: null,
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). If another `GameState` literal is reported, add `pendingSwap: null` there too.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts server/game.ts server/index.ts tests/persistence.test.ts
git commit -m "feat(types): add SwapOffer/SwapRecord and pendingSwap to game state"
```

---

## Task 2: `Game.offerSwap` + `countCyrillicLetters`

**Files:**
- Modify: `server/letters.ts` (add `countCyrillicLetters`)
- Modify: `server/game.ts` (add consts + `offerSwap`)
- Test: `tests/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.ts` (the file already has `makeReadyGame(seed)` at line 84 and `nextInTurnOrder` at line 8):

```ts
describe('Game — offerSwap', () => {
  // The current player offers a tile from their rack for a tile from the next player's rack.
  function setup() {
    const g = makeReadyGame(7);
    const s = g.snapshot();
    const from = s.turnIndex;
    const to = nextInTurnOrder(s.turnOrder, from);
    const giveTileId = s.players[from]!.rack[0]!.id;
    const takeTileId = s.players[to]!.rack[0]!.id;
    return { g, from, to, giveTileId, takeTileId };
  }
  const WORD = 'КОРЮШКА'; // 7 letters

  it('stores a pending swap on a valid offer', () => {
    const { g, from, to, giveTileId, takeTileId } = setup();
    g.offerSwap(from, to, giveTileId, takeTileId, WORD);
    const ps = g.snapshot().pendingSwap;
    expect(ps).not.toBeNull();
    expect(ps!.fromSlot).toBe(from);
    expect(ps!.toSlot).toBe(to);
    expect(ps!.giveTileId).toBe(giveTileId);
    expect(ps!.takeTileId).toBe(takeTileId);
    expect(ps!.word).toBe(WORD);
    expect(ps!.phrase.length).toBeGreaterThan(0);
  });

  it('rejects an offer when it is not the offerer\'s turn', () => {
    const { g, from, to, giveTileId, takeTileId } = setup();
    expect(() => g.offerSwap(to, from, takeTileId, giveTileId, WORD)).toThrow();
  });

  it('rejects an offer to a player whose rack is hidden', () => {
    const { g, from, to, giveTileId, takeTileId } = setup();
    g.toggleRackVisibility(to, false);
    expect(() => g.offerSwap(from, to, giveTileId, takeTileId, WORD)).toThrow();
  });

  it('rejects a word shorter than 7 letters', () => {
    const { g, from, to, giveTileId, takeTileId } = setup();
    expect(() => g.offerSwap(from, to, giveTileId, takeTileId, 'КОТ')).toThrow();
  });

  it('rejects a tile not on the relevant rack', () => {
    const { g, from, to, takeTileId } = setup();
    expect(() => g.offerSwap(from, to, 'no-such-tile', takeTileId, WORD)).toThrow();
  });

  it('rejects a second offer while one is pending', () => {
    const { g, from, to, giveTileId, takeTileId } = setup();
    g.offerSwap(from, to, giveTileId, takeTileId, WORD);
    expect(() => g.offerSwap(from, to, giveTileId, takeTileId, WORD)).toThrow();
  });

  it('does not advance the turn on offer', () => {
    const { g, from, to, giveTileId, takeTileId } = setup();
    g.offerSwap(from, to, giveTileId, takeTileId, WORD);
    expect(g.snapshot().turnIndex).toBe(from);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game.test.ts -t "offerSwap"`
Expected: FAIL — `g.offerSwap is not a function`.

- [ ] **Step 3: Add `countCyrillicLetters` to `server/letters.ts`**

After `isCyrillicLetter` (ends ~line 31):

```ts
export function countCyrillicLetters(value: string): number {
  let n = 0;
  for (const ch of value.toUpperCase()) if (isCyrillicLetter(ch)) n++;
  return n;
}
```

- [ ] **Step 4: Add consts + `offerSwap` to `server/game.ts`**

Add the import near the top (extend the existing `./letters.js` import):

```ts
import { compareLetterOrder, countCyrillicLetters } from './letters.js';
```

Add module-level constants just above `export class Game` (~line 26):

```ts
const SWAP_MIN_WORD_LEN = 7;
const SWAP_PHRASES = [
  'Какое крутое слово!',
  'Вот это да!',
  'Ну и ну!',
  'Вот это слово так слово!',
  'Какая красота!',
];
```

Add the method inside the class, just after `giveAssist` (~line 245):

```ts
  /**
   * Offer to trade one of your tiles for one of another player's, on your turn.
   * Honor-system "cool word" gate: the declared word must be ≥ 7 Cyrillic letters,
   * but is never verified. Stores a pending offer; the target responds via respondSwap.
   */
  offerSwap(fromSlot: Slot, toSlot: Slot, giveTileId: string, takeTileId: string, word: string): void {
    this.assertTurn(fromSlot);
    if (this.state.pendingSwap !== null) throw new Error('Обмен уже предложен');
    if (toSlot === fromSlot || (toSlot !== 0 && toSlot !== 1 && toSlot !== 2)) {
      throw new Error('Неверный игрок для обмена');
    }
    const target = this.state.players[toSlot]!;
    if (!target.rackVisible) throw new Error('Стойка игрока скрыта');
    const from = this.state.players[fromSlot]!;
    if (!from.rack.some((t) => t.id === giveTileId)) throw new Error('Вашей плитки нет на стойке');
    if (!target.rack.some((t) => t.id === takeTileId)) throw new Error('Плитки игрока нет на стойке');
    if (countCyrillicLetters(word) < SWAP_MIN_WORD_LEN) {
      throw new Error('Слово должно быть не короче 7 букв');
    }
    // Deterministic phrase choice (engine must not call Math.random); rotates per event.
    const phrase = SWAP_PHRASES[this.state.events.length % SWAP_PHRASES.length]!;
    this.state.pendingSwap = { fromSlot, toSlot, giveTileId, takeTileId, word, phrase, createdAt: Date.now() };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/game.test.ts -t "offerSwap"`
Expected: PASS (all 7).

- [ ] **Step 6: Commit**

```bash
git add server/letters.ts server/game.ts tests/game.test.ts
git commit -m "feat(game): offerSwap stores a pending tile-swap offer"
```

---

## Task 3: `Game.respondSwap` (accept / decline)

**Files:**
- Modify: `server/game.ts` (add `respondSwap`)
- Test: `tests/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.ts`:

```ts
describe('Game — respondSwap', () => {
  function offer(seed = 7) {
    const g = makeReadyGame(seed);
    const s = g.snapshot();
    const from = s.turnIndex;
    const to = nextInTurnOrder(s.turnOrder, from);
    const giveTile = s.players[from]!.rack[0]!;
    const takeTile = s.players[to]!.rack[0]!;
    g.offerSwap(from, to, giveTile.id, takeTile.id, 'КОРЮШКА');
    return { g, from, to, giveTile, takeTile };
  }

  it('accept exchanges the tiles, applies −5/+5, logs a swap, clears the offer', () => {
    const { g, from, to, giveTile, takeTile } = offer();
    g.respondSwap(to, true);
    const s = g.snapshot();
    expect(s.pendingSwap).toBeNull();
    expect(s.players[from]!.rack.some((t) => t.id === takeTile.id)).toBe(true);
    expect(s.players[from]!.rack.some((t) => t.id === giveTile.id)).toBe(false);
    expect(s.players[to]!.rack.some((t) => t.id === giveTile.id)).toBe(true);
    expect(s.players[from]!.score).toBe(-5);
    expect(s.players[to]!.score).toBe(5);
    const last = s.events[s.events.length - 1]!;
    expect(last.kind).toBe('swap');
  });

  it('accept does not advance the turn', () => {
    const { g, from } = offer();
    g.respondSwap(g.snapshot().pendingSwap!.toSlot, true);
    expect(g.snapshot().turnIndex).toBe(from);
  });

  it('decline clears the offer and logs nothing', () => {
    const { g, to } = offer();
    const before = g.snapshot().events.length;
    g.respondSwap(to, false);
    const s = g.snapshot();
    expect(s.pendingSwap).toBeNull();
    expect(s.events.length).toBe(before);
    expect(s.players[s.turnIndex]!.score).toBe(0);
  });

  it('rejects a response from a slot other than the target', () => {
    const { g, from } = offer();
    expect(() => g.respondSwap(from, true)).toThrow();
  });

  it('throws when there is no pending offer', () => {
    const g = makeReadyGame(7);
    expect(() => g.respondSwap(0, true)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game.test.ts -t "respondSwap"`
Expected: FAIL — `g.respondSwap is not a function`.

- [ ] **Step 3: Add `respondSwap` to `server/game.ts`**

Immediately after `offerSwap`:

```ts
  /**
   * Target accepts or declines the pending swap. On accept the two tiles change
   * racks, the offerer pays −5 and the giver earns +5, and a SwapRecord is logged.
   * Like the +5 helping hand, this does not touch single-step undo.
   */
  respondSwap(slot: Slot, accept: boolean): void {
    const offer = this.state.pendingSwap;
    if (offer === null) throw new Error('Нет предложенного обмена');
    if (slot !== offer.toSlot) throw new Error('Ответить может только адресат');
    if (!accept) {
      this.state.pendingSwap = null;
      return;
    }
    const from = this.state.players[offer.fromSlot]!;
    const to = this.state.players[offer.toSlot]!;
    const giveIdx = from.rack.findIndex((t) => t.id === offer.giveTileId);
    const takeIdx = to.rack.findIndex((t) => t.id === offer.takeTileId);
    if (giveIdx === -1 || takeIdx === -1) {
      // A tile moved since the offer (e.g. claimBlank) — abort cleanly.
      this.state.pendingSwap = null;
      throw new Error('Плитки изменились — обмен отменён');
    }
    const giveTile = from.rack.splice(giveIdx, 1)[0]!;
    const takeTile = to.rack.splice(takeIdx, 1)[0]!;
    from.rack.push(takeTile);
    to.rack.push(giveTile);
    from.score -= 5;
    to.score += 5;
    this.state.events.push({
      kind: 'swap',
      fromSlot: offer.fromSlot,
      toSlot: offer.toSlot,
      word: offer.word,
      gaveLetter: giveTile.isBlank ? '' : giveTile.letter,
      tookLetter: takeTile.isBlank ? '' : takeTile.letter,
      timestamp: Date.now(),
    });
    this.state.pendingSwap = null;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game.test.ts -t "respondSwap"`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "feat(game): respondSwap completes or declines a tile swap"
```

---

## Task 4: `Game.cancelSwap` + clear pending offer on turn-ending actions

**Files:**
- Modify: `server/game.ts` (add `cancelSwap`; clear `pendingSwap` in `submitMove`, `passTurn`, `swapAllAndPass`, `endGame`)
- Test: `tests/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.ts`. The helper builds a legal first move so `submitMove` succeeds; reuse the existing first-move helper pattern in this file if one exists, otherwise pass turn to clear.

```ts
describe('Game — cancelSwap and stale-offer clearing', () => {
  function offer(seed = 7) {
    const g = makeReadyGame(seed);
    const s = g.snapshot();
    const from = s.turnIndex;
    const to = nextInTurnOrder(s.turnOrder, from);
    g.offerSwap(from, to, s.players[from]!.rack[0]!.id, s.players[to]!.rack[0]!.id, 'КОРЮШКА');
    return { g, from, to };
  }

  it('initiator can cancel their own offer', () => {
    const { g, from } = offer();
    g.cancelSwap(from);
    expect(g.snapshot().pendingSwap).toBeNull();
  });

  it('a non-initiator cannot cancel', () => {
    const { g, to } = offer();
    expect(() => g.cancelSwap(to)).toThrow();
  });

  it('passing clears a pending offer', () => {
    const { g, from } = offer();
    g.passTurn(from);
    expect(g.snapshot().pendingSwap).toBeNull();
  });

  it('ending the game clears a pending offer', () => {
    const { g, from } = offer();
    g.endGame(from);
    expect(g.snapshot().pendingSwap).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game.test.ts -t "cancelSwap and stale"`
Expected: FAIL — `g.cancelSwap is not a function`.

- [ ] **Step 3: Add `cancelSwap` to `server/game.ts`**

After `respondSwap`:

```ts
  cancelSwap(slot: Slot): void {
    const offer = this.state.pendingSwap;
    if (offer === null) throw new Error('Нет предложенного обмена');
    if (slot !== offer.fromSlot) throw new Error('Отменить может только предложивший');
    this.state.pendingSwap = null;
  }
```

- [ ] **Step 4: Clear `pendingSwap` in turn-ending actions**

In `submitMove`, right after the validation guard `if (!validation.ok) return ...` (~line 196), before `this.maybeClearRevertOnActionBy(slot);`:

```ts
    this.state.pendingSwap = null;
```

In `passTurn`, after `this.assertTurn(slot);` (~line 284):

```ts
    this.state.pendingSwap = null;
```

In `swapAllAndPass`, after the `if (this.bag.tiles.length === 0) ...` guard (~line 301), before `const tileCount`:

```ts
    this.state.pendingSwap = null;
```

In `endGame`, after `if (this.state.phase !== 'playing') return;` (~line 378):

```ts
    this.state.pendingSwap = null;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/game.test.ts -t "cancelSwap and stale"`
Expected: PASS (all 4).

- [ ] **Step 6: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "feat(game): cancelSwap and clear pending offer on turn-ending actions"
```

---

## Task 5: `fromState` back-fill + persistence round-trip

Older saved games (and the persistence test's hand-built states) may lack `pendingSwap`. Back-fill it to `null`, the same way `turnOrder` is handled.

**Files:**
- Modify: `server/game.ts:63-83` (`fromState`)
- Test: `tests/game.test.ts`, `tests/persistence.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.ts`:

```ts
describe('Game — fromState back-fill', () => {
  it('defaults a missing pendingSwap to null', () => {
    const g = makeReadyGame(7);
    const s = g.snapshot() as Record<string, unknown>;
    delete s['pendingSwap'];
    const restored = Game.fromState(s as unknown as import('@shared/types').GameState);
    expect(restored.snapshot().pendingSwap).toBeNull();
  });

  it('preserves a non-null pendingSwap through a round-trip', () => {
    const g = makeReadyGame(7);
    const st = g.snapshot();
    const from = st.turnIndex;
    const to = nextInTurnOrder(st.turnOrder, from);
    g.offerSwap(from, to, st.players[from]!.rack[0]!.id, st.players[to]!.rack[0]!.id, 'КОРЮШКА');
    const restored = Game.fromState(g.snapshot());
    expect(restored.snapshot().pendingSwap?.word).toBe('КОРЮШКА');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/game.test.ts -t "fromState back-fill"`
Expected: FAIL on the first test — restored `pendingSwap` is `undefined`, not `null`.

- [ ] **Step 3: Back-fill in `fromState`**

In `server/game.ts` `fromState`, right after the existing `turnOrder` back-fill block (~line 69):

```ts
    if ((cloned as { pendingSwap?: unknown }).pendingSwap === undefined) {
      cloned.pendingSwap = null;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/game.test.ts -t "fromState back-fill"`
Expected: PASS (both).

- [ ] **Step 5: Add a persistence round-trip assertion**

In `tests/persistence.test.ts`, inside the existing `describe('persistence', ...)` block, add:

```ts
  it('roundtrips a non-null pendingSwap', () => {
    const s = sampleState();
    s.pendingSwap = {
      fromSlot: 0, toSlot: 1, giveTileId: 't-1', takeTileId: 't-2',
      word: 'КОРЮШКА', phrase: 'Какое крутое слово!', createdAt: 1_700_000_000_000,
    };
    saveActiveGame(dataDir, s);
    expect(loadActiveGame(dataDir)?.pendingSwap?.word).toBe('КОРЮШКА');
  });
```

- [ ] **Step 6: Run the persistence test**

Run: `npx vitest run tests/persistence.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/game.ts tests/game.test.ts tests/persistence.test.ts
git commit -m "feat(game): persist and back-fill pendingSwap"
```

---

## Task 6: Wire WS handlers in `server/index.ts`

`handleEngineAction` already saves, broadcasts, and archives-if-finished, and reports thrown `Error` messages back to the sender as `{ type: 'error', message }`. The new methods throw Russian-text errors, so no `humanReadableReason` entries are needed.

**Files:**
- Modify: `server/index.ts:194-291` (`attachInGameHandler` switch)

- [ ] **Step 1: Add the three cases**

In the `switch (msg.type)` inside `attachInGameHandler`, after the `case 'swapAll':` block (~line 226):

```ts
        case 'offerSwap':
          handleEngineAction(ws, () => game!.offerSwap(slot, msg.toSlot, msg.giveTileId, msg.takeTileId, msg.word));
          return;
        case 'respondSwap':
          handleEngineAction(ws, () => game!.respondSwap(slot, msg.accept));
          return;
        case 'cancelSwap':
          handleEngineAction(ws, () => game!.cancelSwap(slot));
          return;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (The `ClientMessage` union now narrows `msg` to the right shape in each case.)

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat(server): handle offerSwap/respondSwap/cancelSwap over WS"
```

---

## Task 7: Integration test — offer→accept and offer→decline

Reuse the helpers already defined at the top of `tests/integration/m4b-server.test.ts` (`buffered`, `waitFor`, `join`, `send`, `driveDraws`, `freshServer`, `isStatePlaying`).

**Files:**
- Modify: `tests/integration/m4b-server.test.ts` (append a new `describe`)

- [ ] **Step 1: Write the test**

Append at the end of `tests/integration/m4b-server.test.ts`:

```ts
describe('integration — cool-word swap', () => {
  function latestState(b: Buffered) {
    return b.messages.filter((m): m is Extract<ServerMessage, { type: 'state' }> => m.type === 'state').at(-1)!;
  }

  it('offer then accept moves tiles and applies −5/+5', async () => {
    const { server, url } = await freshServer();
    const bs = [await buffered(url), await buffered(url), await buffered(url)] as const;
    join(bs[0], 0, 'A'); join(bs[1], 1, 'B'); join(bs[2], 2, 'C');
    await driveDraws(bs);
    await waitFor(bs[0], isStatePlaying());

    const st = latestState(bs[0]).state;
    const from = st.turnIndex;
    const to = ((from + 1) % 3) as Slot;
    const giveTileId = st.players[from]!.rack[0]!.id;
    const takeTileId = st.players[to]!.rack[0]!.id;

    send(bs[from], { type: 'offerSwap', toSlot: to, giveTileId, takeTileId, word: 'КОРЮШКА' });
    await waitFor(bs[to], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap !== null);

    send(bs[to], { type: 'respondSwap', accept: true });
    await waitFor(bs[from], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap === null && m.state.players[from]!.score === -5);

    const final = latestState(bs[from]).state;
    expect(final.players[from]!.score).toBe(-5);
    expect(final.players[to]!.score).toBe(5);
    expect(final.players[from]!.rack.some((t) => t.id === takeTileId)).toBe(true);
    expect(final.events.some((e) => e.kind === 'swap')).toBe(true);

    await server.close();
  });

  it('offer then decline clears the offer with no score change', async () => {
    const { server, url } = await freshServer();
    const bs = [await buffered(url), await buffered(url), await buffered(url)] as const;
    join(bs[0], 0, 'A'); join(bs[1], 1, 'B'); join(bs[2], 2, 'C');
    await driveDraws(bs);
    await waitFor(bs[0], isStatePlaying());

    const st = latestState(bs[0]).state;
    const from = st.turnIndex;
    const to = ((from + 1) % 3) as Slot;
    send(bs[from], { type: 'offerSwap', toSlot: to,
      giveTileId: st.players[from]!.rack[0]!.id, takeTileId: st.players[to]!.rack[0]!.id, word: 'КОРЮШКА' });
    await waitFor(bs[to], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap !== null);

    send(bs[to], { type: 'respondSwap', accept: false });
    await waitFor(bs[from], (m): m is Extract<ServerMessage, { type: 'state' }> =>
      m.type === 'state' && m.state.pendingSwap === null && m.state.events.length >= 1);

    const final = latestState(bs[from]).state;
    expect(final.players[from]!.score).toBe(0);
    expect(final.players[to]!.score).toBe(0);
    await server.close();
  });
});
```

Note: `((from + 1) % 3)` is the next *seat*, not necessarily the next turn — fine here, the offerer can swap with any visible-racked opponent.

- [ ] **Step 2: Run the integration test**

Run: `npx vitest run tests/integration/m4b-server.test.ts -t "cool-word swap"`
Expected: PASS (both).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/m4b-server.test.ts
git commit -m "test(integration): cool-word swap offer/accept/decline over WS"
```

---

## Task 8: Client senders in `ws.ts`

**Files:**
- Modify: `client/src/ws.ts` (after `sendGiveAssist`, ~line 187)

- [ ] **Step 1: Add the senders**

```ts
export function sendOfferSwap(toSlot: Slot, giveTileId: string, takeTileId: string, word: string): void {
  send({ type: 'offerSwap', toSlot, giveTileId, takeTileId, word });
}
export function sendRespondSwap(accept: boolean): void {
  send({ type: 'respondSwap', accept });
}
export function sendCancelSwap(): void {
  send({ type: 'cancelSwap' });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/ws.ts
git commit -m "feat(client): WS senders for tile swap"
```

---

## Task 9: `SwapDialog` component + "Обмен буквой" button

The dialog opens from the current player's own card. It lets the player pick an opponent (only those with `rackVisible`), one of their own tiles, one of the opponent's tiles, and type the word (≥ 7 Cyrillic letters validated client-side). It mirrors the structure of `ConfirmModal`/`LetterPicker` (full-screen overlay, centered panel).

**Files:**
- Create: `client/src/components/SwapDialog.tsx`
- Modify: `client/src/components/PlayerCard.tsx`

- [ ] **Step 1: Create `client/src/components/SwapDialog.tsx`**

```tsx
import { useState } from 'react';
import type { Player, Slot, Tile } from '@shared/types';
import { sendOfferSwap } from '../ws.js';
import { fishForSlot } from '../fish.js';

const MIN_WORD_LEN = 7;

function cyrillicLen(word: string): number {
  return [...word].filter((ch) => /[а-яёА-ЯЁ]/.test(ch)).length;
}

type Props = {
  mySlot: Slot;
  myRack: Tile[];
  opponents: Player[]; // the other two players (visible-rack ones are selectable)
  onClose: () => void;
};

function TileChip({ tile, selected, onClick }: { tile: Tile; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-md text-lg font-semibold shadow-sm transition-transform ${
        selected ? 'scale-110 ring-2 ring-ink' : 'hover:-translate-y-0.5'
      }`}
      style={{ background: 'var(--color-tile)', color: 'var(--color-ink)' }}
    >
      {tile.isBlank ? '★' : tile.letter}
    </button>
  );
}

export function SwapDialog({ mySlot, myRack, opponents, onClose }: Props) {
  const selectable = opponents.filter((p) => p.rackVisible);
  const [targetSlot, setTargetSlot] = useState<Slot | null>(selectable[0]?.slot ?? null);
  const [giveId, setGiveId] = useState<string | null>(null);
  const [takeId, setTakeId] = useState<string | null>(null);
  const [word, setWord] = useState('');

  const target = opponents.find((p) => p.slot === targetSlot) ?? null;
  const wordOk = cyrillicLen(word) >= MIN_WORD_LEN;
  const canOffer = targetSlot !== null && giveId !== null && takeId !== null && wordOk;
  const myFish = fishForSlot(mySlot);

  function submit() {
    if (!canOffer || targetSlot === null || giveId === null || takeId === null) return;
    sendOfferSwap(targetSlot, giveId, takeId, word.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{ background: 'var(--color-panel)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-2xl font-bold" style={{ color: myFish.deep }}>Обмен буквой</h2>

        {selectable.length === 0 ? (
          <p className="mt-3 text-ink-soft">Ни у кого не видно букв — обмен невозможен.</p>
        ) : (
          <>
            <div className="mt-3">
              <div className="text-sm text-ink-soft">С кем меняемся</div>
              <div className="mt-1 flex gap-2">
                {selectable.map((p) => (
                  <button
                    key={p.slot}
                    type="button"
                    onClick={() => { setTargetSlot(p.slot); setTakeId(null); }}
                    className={`rounded-full px-3 py-1.5 text-base font-semibold ${
                      targetSlot === p.slot ? 'text-white' : 'bg-ink/10 text-ink'
                    }`}
                    style={targetSlot === p.slot ? { background: fishForSlot(p.slot).accent } : undefined}
                  >
                    {p.name || `Слот ${p.slot}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-sm text-ink-soft">Отдаёшь</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {myRack.map((t) => (
                  <TileChip key={t.id} tile={t} selected={giveId === t.id} onClick={() => setGiveId(t.id)} />
                ))}
              </div>
            </div>

            {target !== null && (
              <div className="mt-3">
                <div className="text-sm text-ink-soft">Берёшь у {target.name || `Слот ${target.slot}`}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {target.rack.map((t) => (
                    <TileChip key={t.id} tile={t} selected={takeId === t.id} onClick={() => setTakeId(t.id)} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3">
              <div className="text-sm text-ink-soft">Ради какого слова? (от 7 букв)</div>
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="например, КОРЮШКА"
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white/70 px-3 py-2 text-lg"
              />
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20">
            Отмена
          </button>
          <button
            type="button"
            disabled={!canOffer}
            onClick={submit}
            className="font-heading rounded-full px-4 py-2 text-base font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: myFish.accent }}
          >
            Предложить
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the button into `PlayerCard.tsx`**

Add to the imports at the top of `PlayerCard.tsx`:

```tsx
import { SwapDialog } from './SwapDialog.js';
```

Add a state hook near the other `useState` calls (~line 28):

```tsx
  const [swapOpen, setSwapOpen] = useState(false);
```

In the block that renders the on-turn buttons when `pending.length === 0` (the `{isMine && isCurrentTurn && pending.length === 0 && (...)}` group, ~line 187), add a third button after the swap-all button. It always renders on your turn; the dialog itself handles the "no opponent has a visible rack" case:

```tsx
          <button
            type="button"
            onClick={() => setSwapOpen(true)}
            className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
          >
            Обмен буквой
          </button>
```

At the end of the component's returned JSX, just before the closing `</div>` that wraps the card (after the two `ConfirmModal`s, ~line 232), add:

```tsx
      {swapOpen && (
        <SwapDialog
          mySlot={player.slot}
          myRack={player.rack}
          opponents={(allPlayers as Player[]).filter((p) => p.slot !== player.slot)}
          onClose={() => setSwapOpen(false)}
        />
      )}
```

`allPlayers` is already selected at the top of the component (`const allPlayers = useGameStore((s) => s.state?.players ?? [])`).

- [ ] **Step 3: Typecheck + build the client**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/SwapDialog.tsx client/src/components/PlayerCard.tsx
git commit -m "feat(client): swap-offer dialog and Обмен буквой button"
```

---

## Task 10: `SwapBanner` — pending-offer banner with accept/decline/cancel

Shown to everyone whenever `state.pendingSwap !== null`. The target sees Accept/Decline; the initiator sees Cancel; bystanders see it read-only. Includes the celebratory phrase and the declared word.

**Files:**
- Create: `client/src/components/SwapBanner.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/components/SwapBanner.tsx`**

```tsx
import type { GameState, Slot } from '@shared/types';
import { sendRespondSwap, sendCancelSwap } from '../ws.js';
import { fishForSlot } from '../fish.js';

type Props = { state: GameState; mySlot: Slot };

export function SwapBanner({ state, mySlot }: Props) {
  const offer = state.pendingSwap;
  if (offer === null) return null;

  const nameOf = (slot: Slot): string => state.players[slot]?.name || `Слот ${slot}`;
  const fromFish = fishForSlot(offer.fromSlot);
  const isTarget = mySlot === offer.toSlot;
  const isInitiator = mySlot === offer.fromSlot;

  return (
    <div
      className="w-full rounded-2xl px-4 py-3"
      style={{ background: fromFish.soft, boxShadow: `0 0 0 2px ${fromFish.accent} inset` }}
      data-testid="swap-banner"
    >
      <div className="font-heading text-lg font-bold" style={{ color: fromFish.deep }}>
        {offer.phrase}
      </div>
      <div className="mt-1 text-base text-ink">
        <strong style={{ color: fromFish.deep }}>{nameOf(offer.fromSlot)}</strong>{' '}
        хочет обменять букву с <strong>{nameOf(offer.toSlot)}</strong> ради слова{' '}
        <span className="font-heading font-semibold">«{offer.word}»</span>.
      </div>
      {(isTarget || isInitiator) && (
        <div className="mt-2 flex gap-2">
          {isTarget && (
            <>
              <button
                type="button"
                onClick={() => sendRespondSwap(true)}
                className="font-heading rounded-full px-4 py-2 text-base font-semibold text-white shadow"
                style={{ background: fromFish.accent }}
              >
                Согласна (+5)
              </button>
              <button
                type="button"
                onClick={() => sendRespondSwap(false)}
                className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
              >
                Отказаться
              </button>
            </>
          )}
          {isInitiator && (
            <button
              type="button"
              onClick={() => sendCancelSwap()}
              className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
            >
              Отменить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount it in `App.tsx`**

Add the import near the other component imports (~line 13):

```tsx
import { SwapBanner } from './components/SwapBanner.js';
```

Render it just below `<ErrorBanner />` (line 209), inside the left column:

```tsx
          <Board board={state.board} size={boardSquareSize} />
          <ErrorBanner />
          <SwapBanner state={state} mySlot={identity.slot} />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/SwapBanner.tsx client/src/App.tsx
git commit -m "feat(client): pending swap banner with accept/decline/cancel"
```

---

## Task 11: Render the `swap` event in `MoveLog`

`renderEvent` switches over every `GameEvent` kind. Add the `swap` case so the move log shows completed swaps (and TypeScript stays exhaustive in spirit).

**Files:**
- Modify: `client/src/components/MoveLog.tsx`

- [ ] **Step 1: Add the `case 'swap'` to `renderEvent`**

In `renderEvent` (the `switch (e.kind)`), after the `case 'claimBlank'` block (~line 121) and before `case 'endGame'`:

```tsx
    case 'swap': {
      const fromName = nameOf(e.fromSlot);
      const toName = nameOf(e.toSlot);
      const gave = e.gaveLetter || '★';
      const took = e.tookLetter || '★';
      return (
        <div className="flex items-start gap-2">
          <FishStamp slot={e.fromSlot} />
          <div className="flex-1 min-w-0">
            <PlayerName slot={e.fromSlot} nameOf={nameOf} /> ↔ <PlayerName slot={e.toSlot} nameOf={nameOf} />:{' '}
            отдал{isFemName(fromName) ? 'а' : ''} {gave}, взял{isFemName(fromName) ? 'а' : ''} {took}{' '}
            <span className="text-ink-soft">— ради «{e.word}»</span>{' '}
            <span className="tabular-nums font-bold">−5</span>/<span className="tabular-nums font-bold">+5</span>
            <span className="sr-only">{toName}</span>
          </div>
        </div>
      );
    }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/MoveLog.tsx
git commit -m "feat(client): show swap events in the move log"
```

---

## Task 12: Update the design spec + full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-scrabble-design.md`

- [ ] **Step 1: Add the House Rule row**

In the House Rules table (§3), add a row after the "Helping hand (+5)" row:

```markdown
| **Cool-word swap** | On your turn (before submitting), you may offer to trade one of your rack tiles for a specific tile from one opponent whose rack is visible, declaring a "cool word" of ≥ 7 letters. The word is self-declared and never verified. If the opponent accepts, the tiles trade, you get **−5** and they get **+5**, and a `swap` event is logged. Declining clears the offer. The swap does not consume your turn. See `2026-06-01-cool-word-swap-design.md`. |
```

- [ ] **Step 2: Add the new components to the file-layout list**

In §6, under `client/components/`, add:

```
│   │   ├── SwapDialog.tsx           # Offer dialog: pick opponent + two tiles + cool word
│   │   ├── SwapBanner.tsx           # Pending-swap banner: accept / decline / cancel
```

- [ ] **Step 3: Full verification**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; full Vitest suite green (including the new game, persistence, and integration tests).

- [ ] **Step 4: Manual smoke test (optional but recommended)**

Run `npm run dev`, open three tabs as the three family slots, and on the current player's turn: open "Обмен буквой", pick an opponent + two tiles + a 7-letter word, send. Confirm the banner with a celebratory phrase appears in all three tabs, the target can Accept/Decline, scores move −5/+5 on accept, and the move log shows the swap.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-scrabble-design.md
git commit -m "docs: record cool-word swap house rule and components"
```

---

## Self-Review Notes

- **Spec coverage:** §2 experience → Tasks 9/10; §3 rules (when/turn-cost/gate/selection/eligibility/points/negative/concurrency/undo/clearing) → Tasks 2–4; §4 data model → Task 1 + Task 5 back-fill; §5 protocol → Tasks 1/6/8; §6 phrases → Task 2 (`SWAP_PHRASES`); §7 UI → Tasks 9/10/11; §8 testing → Tasks 2–5, 7. All covered.
- **Known minor edge (accepted, per spec "does not touch undo"):** if the initiator armed undo via a `claimBlank` earlier in the same turn, then completes a swap, a subsequent `revertLastTurn` rolls back to the pre-claimBlank snapshot, which predates the swap. This is an extreme corner; the spec explicitly keeps swaps out of the undo machinery, so we accept it rather than add coupling.
- **Type consistency:** method names `offerSwap`/`respondSwap`/`cancelSwap`, field `pendingSwap`, event kind `'swap'`, and record fields `gaveLetter`/`tookLetter` are used identically across server, client, tests, and protocol.
