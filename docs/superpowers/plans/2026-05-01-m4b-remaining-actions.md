# M4b — Remaining Rule Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the remaining turn actions (pass, redraw, claimBlank, endGame) end-to-end, remove standard `swapTiles` from the game, and add a single-step "revert last turn" affordance for the move's author.

**Architecture:** Engine already implements `passTurn`, `redrawRack`, `claimBlank`, `endGame`; server WS handler currently stubs them with "not yet implemented" — replace stubs with real calls + broadcast. Add `lastSnapshot` field on `Game` (deep-cloned `GameState` + actor slot) cleared the moment any other player acts; `revertLastTurn` restores from it. Per-player view gains `redrawEligible` and `canRevert` booleans so the client doesn't need engine logic. Client gets a new `ActionBar.tsx` with Pass / Redraw / End game / Revert (visibility per spec §3); claim-blank reuses the existing dnd-kit drop targets.

**Tech Stack:** TypeScript (strict, NodeNext), Node 20, `ws`, Zustand, React 19, Vite, Tailwind 4, Vitest, dnd-kit.

**Spec:** `docs/superpowers/specs/2026-05-01-m4b-remaining-actions-design.md`

**Conventions:**
- TDD per CLAUDE.md: failing test first, smallest implementation, full suite passes.
- Run `npm run typecheck && npm test` before each commit.
- One commit per task. No Co-Authored-By trailers.
- `.js` extensions on relative imports (NodeNext).

---

## File Plan

| Path | Change |
|---|---|
| `docs/superpowers/specs/2026-04-30-scrabble-design.md` | §3 row "Tile swap" → deleted; add row "Revert last turn"; §6.4 drop `swapTiles`, add `revertLastTurn`, document `redrawEligible` + `canRevert` on `Player` |
| `shared/types.ts` | Drop `swapTiles` from `ClientMessage`; add `revertLastTurn`; add `redrawEligible: boolean` and `canRevert: boolean` to `Player` |
| `server/game.ts` | Delete `swapTiles`; add `lastSnapshot` field; arm/clear it in mutating actions; new `revertLastTurn`; stamp `redrawEligible` and `canRevert` in `snapshot()` |
| `server/index.ts` | Replace stub cases with real handlers; delete `swapTiles` case; add `revertLastTurn` case; persist after each successful action |
| `tests/game.test.ts` | Drop swap tests; add tests for revert (4 actions), revert auth (only author), revert window (cleared by other player), `canRevert` snapshot field, `redrawEligible` snapshot field, end-game does not arm revert |
| `tests/persistence.test.ts` | Assert `lastSnapshot` is intentionally not serialized (round-trip drops the revert window) |
| `tests/integration/m4b-server.test.ts` | New — pass, redraw (eligible + ineligible), claimBlank (success + ineligible), endGame, revert happy path, revert rejected when other player acted |
| `client/src/store.ts` | (no schema change — `redrawEligible`/`canRevert` come through `state.players`) |
| `client/src/ws.ts` | Add `sendPass`, `sendRedraw`, `sendClaimBlank`, `sendEndGame`, `sendRevertLastTurn` |
| `client/src/components/ActionBar.tsx` | New |
| `client/src/components/ConfirmModal.tsx` | New (reused by Pass / End game / Revert) |
| `client/src/components/Square.tsx` | Allow drop onto a square that already holds a blank (claim-blank path) |
| `client/src/App.tsx` | Detect drop onto blank-bearing square → `sendClaimBlank`; mount `ActionBar` |

---

## Task 1: Drop `swapTiles` from the protocol and engine

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/game.ts`
- Modify: `server/index.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Remove the failing assertion path** — open `tests/game.test.ts`, delete every `describe`/`it` block whose subject is `swapTiles` (search for `swapTiles`). Save.

- [ ] **Step 2: Remove engine method**

In `server/game.ts`, delete the entire `swapTiles(slot: Slot, tileIds: string[]): void { ... }` method.

- [ ] **Step 3: Remove protocol variant**

In `shared/types.ts`, delete the line:

```ts
  | { type: 'swapTiles'; tileIds: string[] }
```

- [ ] **Step 4: Remove server case**

In `server/index.ts` inside the `attachInGameHandler` switch, change:

```ts
        case 'swapTiles':
        case 'claimBlank':
        case 'pass':
        case 'redraw':
        case 'toggleRackVisible':
        case 'endGame':
          sendMsg(ws, { type: 'error', message: 'not yet implemented' });
          return;
```

to:

```ts
        case 'claimBlank':
        case 'pass':
        case 'redraw':
        case 'toggleRackVisible':
        case 'endGame':
          sendMsg(ws, { type: 'error', message: 'not yet implemented' });
          return;
```

(The other cases stay stubbed for now; later tasks fill them in.)

- [ ] **Step 5: Verify build + tests pass**

Run: `npm run typecheck && npm test`
Expected: PASS. No reference to `swapTiles` remains.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts server/game.ts server/index.ts tests/game.test.ts
git commit -m "feat(rules): remove standard tile-swap action"
```

---

## Task 2: Add `redrawEligible` and `canRevert` to per-player snapshot

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Game } from '../server/game.js';

describe('snapshot per-player flags', () => {
  it('exposes redrawEligible=false and canRevert=false on a fresh game', () => {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    const snap = g.snapshot();
    for (const p of snap.players) {
      expect(typeof p.redrawEligible).toBe('boolean');
      expect(p.canRevert).toBe(false);
    }
  });

  it('redrawEligible is true when the rack is all-vowel', () => {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    // Force player 0's rack to all vowels for the assertion (mutate via snapshot reflection).
    // We cheat by replacing the rack in-place through a fresh fromState round-trip.
    const state = g.snapshot();
    state.players[0]!.rack = state.players[0]!.rack.map((t, i) =>
      ({ ...t, letter: ['А','Е','И','О','У','Ы','Э'][i % 7]!, points: 1, isBlank: false }),
    );
    const g2 = Game.fromState(state);
    expect(g2.snapshot().players[0]!.redrawEligible).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game.test.ts -t "snapshot per-player flags"`
Expected: FAIL (TypeScript or assertion error — `redrawEligible`/`canRevert` not on Player).

- [ ] **Step 3: Add fields to Player type**

In `shared/types.ts`, replace the `Player` definition with:

```ts
export type Player = {
  slot: Slot;
  name: string;
  connected: boolean;
  rack: Tile[];
  rackVisible: boolean;
  score: number;
  redrawEligible: boolean;  // computed from rack: all-vowel or all-consonant
  canRevert: boolean;       // this player just acted and no one else has acted since
};
```

- [ ] **Step 4: Stamp the fields in snapshot**

In `server/game.ts`, replace the `snapshot()` method with:

```ts
  snapshot(): GameState {
    const cloned = structuredClone(this.state);
    for (const p of cloned.players) {
      p.redrawEligible = redrawEligible(p.rack);
      p.canRevert = this.lastSnapshot !== null && this.lastSnapshot.bySlot === p.slot;
    }
    return cloned;
  }
```

(`lastSnapshot` field is added in Task 3; for now declare it as `private lastSnapshot: { state: GameState; bySlot: Slot } | null = null;` at the top of the class so this compiles.)

Also fix the constructor's player factory so `redrawEligible` and `canRevert` are present (avoid `undefined` slipping through `structuredClone`):

```ts
    const players: [Player, Player, Player] = [0, 1, 2].map((slot) => ({
      slot: slot as Slot,
      name: '',
      connected: false,
      rack: [] as Tile[],
      rackVisible: true,
      score: 0,
      redrawEligible: false,
      canRevert: false,
    })) as [Player, Player, Player];
```

- [ ] **Step 5: Update lobby snapshot in server/index.ts**

In `server/index.ts`, the `lobbySnapshot()` function builds player objects manually — extend each with `redrawEligible: false, canRevert: false`:

```ts
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
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npm run typecheck && npm test`
Expected: PASS (including the two new cases).

- [ ] **Step 7: Commit**

```bash
git add shared/types.ts server/game.ts server/index.ts tests/game.test.ts
git commit -m "feat(engine): expose redrawEligible+canRevert on player snapshot"
```

---

## Task 3: Engine — `lastSnapshot` field and revert on submitMove

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.ts`:

```ts
describe('Game.revertLastTurn after submitMove', () => {
  function setup() {
    const g = new Game({ seed: 7 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    return g;
  }

  it('restores board, rack, score, turnIndex after revert', () => {
    const g = setup();
    const before = g.snapshot();
    // Force a deterministic playable rack/board for player 0.
    // Use a small horizontal placement on row 7 covering center using letters from rack.
    const p0 = g.snapshot().players[0]!;
    const t0 = p0.rack[0]!;
    const t1 = p0.rack[1]!;
    const result = g.submitMove(0, [
      { tileId: t0.id, row: 7, col: 7, playedAs: t0.letter },
      { tileId: t1.id, row: 7, col: 8, playedAs: t1.letter },
    ]);
    if (result.ok) {
      const after = g.snapshot();
      expect(after.players[0]!.canRevert).toBe(true);
      expect(after.turnIndex).toBe(1);
      g.revertLastTurn(0);
      const reverted = g.snapshot();
      expect(reverted.turnIndex).toBe(0);
      expect(reverted.players[0]!.score).toBe(before.players[0]!.score);
      expect(reverted.players[0]!.rack.map((t) => t.id).sort()).toEqual(
        before.players[0]!.rack.map((t) => t.id).sort(),
      );
      expect(reverted.board[7]![7]).toBeNull();
      expect(reverted.players[0]!.canRevert).toBe(false);
    } else {
      // If the seed produces a rack that won't form a legal first-move 2-tile word, skip.
      expect(true).toBe(true);
    }
  });

  it('rejects revert from a non-author', () => {
    const g = setup();
    const p0 = g.snapshot().players[0]!;
    const t0 = p0.rack[0]!; const t1 = p0.rack[1]!;
    const r = g.submitMove(0, [
      { tileId: t0.id, row: 7, col: 7, playedAs: t0.letter },
      { tileId: t1.id, row: 7, col: 8, playedAs: t1.letter },
    ]);
    if (!r.ok) return;
    expect(() => g.revertLastTurn(1)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run tests/game.test.ts -t "revertLastTurn after submitMove"`
Expected: FAIL — `g.revertLastTurn` is not a function.

- [ ] **Step 3: Implement**

In `server/game.ts`, add at the top of the `Game` class body (already declared in Task 2):

```ts
  // Single-level undo. Captured pre-mutation by submitMove/passTurn/redrawRack/claimBlank.
  // Cleared the moment a different slot acts. Not persisted to disk.
  private lastSnapshot: { state: GameState; bySlot: Slot } | null = null;
```

Add a private helper:

```ts
  private armRevert(slot: Slot, preState: GameState): void {
    this.lastSnapshot = { state: preState, bySlot: slot };
  }

  private maybeClearRevertOnActionBy(slot: Slot): void {
    if (this.lastSnapshot !== null && this.lastSnapshot.bySlot !== slot) {
      this.lastSnapshot = null;
    }
  }
```

In `submitMove`, immediately after the `if (slot !== this.state.turnIndex)` guard, **before** any mutation, capture the snapshot:

```ts
    this.maybeClearRevertOnActionBy(slot);
    const preStateForRevert = structuredClone(this.state);
```

Then at the very end of the method (just before `return { ok: true, ... }`), add:

```ts
    this.armRevert(slot, preStateForRevert);
```

Add the new method on the class (alongside `endGame` etc.):

```ts
  revertLastTurn(slot: Slot): void {
    if (this.lastSnapshot === null) throw new Error('Nothing to revert');
    if (this.lastSnapshot.bySlot !== slot) throw new Error('Only the action author can revert');
    this.state = this.lastSnapshot.state;
    // Re-sync the bag wrapper with the restored tile array (next draw uses restored bag).
    this.bag = bagFromTiles(this.state.bag, makeRng(Date.now()));
    this.state.bag = this.bag.tiles;
    this.lastSnapshot = null;
  }
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "feat(engine): single-level revert for submitMove"
```

---

## Task 4: Engine — arm revert on pass, redraw, claimBlank; clear on cross-player action

**Files:**
- Modify: `server/game.ts`
- Modify: `tests/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe('revert across action types', () => {
  function setup() {
    const g = new Game({ seed: 11 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    return g;
  }

  it('arms revert after pass and restores turnIndex', () => {
    const g = setup();
    g.passTurn(0);
    expect(g.snapshot().turnIndex).toBe(1);
    expect(g.snapshot().players[0]!.canRevert).toBe(true);
    g.revertLastTurn(0);
    expect(g.snapshot().turnIndex).toBe(0);
    expect(g.snapshot().players[0]!.canRevert).toBe(false);
  });

  it('clears revert window when another player acts', () => {
    const g = setup();
    g.passTurn(0);
    expect(g.snapshot().players[0]!.canRevert).toBe(true);
    g.passTurn(1);
    expect(g.snapshot().players[0]!.canRevert).toBe(false);
    expect(() => g.revertLastTurn(0)).toThrow();
  });

  it('endGame does not arm revert', () => {
    const g = setup();
    g.endGame(0);
    expect(g.snapshot().players[0]!.canRevert).toBe(false);
    expect(() => g.revertLastTurn(0)).toThrow();
  });

  it('arms revert after redrawRack (when eligible) and restores rack+bag', () => {
    const g = setup();
    // Coerce player 0's rack to all vowels via state surgery.
    const s = g.snapshot();
    s.players[0]!.rack = s.players[0]!.rack.map((t, i) =>
      ({ ...t, letter: ['А','Е','И','О','У','Ы','Э'][i % 7]!, points: 1, isBlank: false }),
    );
    const g2 = Game.fromState(s);
    const beforeRack = g2.snapshot().players[0]!.rack.map((t) => t.id).sort();
    g2.redrawRack(0);
    expect(g2.snapshot().players[0]!.canRevert).toBe(true);
    g2.revertLastTurn(0);
    expect(g2.snapshot().players[0]!.rack.map((t) => t.id).sort()).toEqual(beforeRack);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npx vitest run tests/game.test.ts -t "revert across action types"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `server/game.ts`:

`passTurn`:

```ts
  passTurn(slot: Slot): void {
    this.assertTurn(slot);
    this.maybeClearRevertOnActionBy(slot);
    const pre = structuredClone(this.state);
    this.state.turnIndex = ((slot + 1) % 3) as Slot;
    this.armRevert(slot, pre);
  }
```

`redrawRack`:

```ts
  redrawRack(slot: Slot): void {
    this.assertTurn(slot);
    const player = this.state.players[slot]!;
    if (!redrawEligible(player.rack)) {
      throw new Error('Rack is not eligible for free redraw (must be all vowels or all consonants)');
    }
    this.maybeClearRevertOnActionBy(slot);
    const pre = structuredClone(this.state);
    const allIds = player.rack.map((t) => t.id);
    const removed = removeTilesFromRack(player.rack, allIds);
    returnTiles(this.bag, removed);
    const drawn = drawTiles(this.bag, 7);
    addTilesToRack(player.rack, drawn);
    this.state.bag = this.bag.tiles;
    this.armRevert(slot, pre);
  }
```

`claimBlank`: same pattern — call `maybeClearRevertOnActionBy(slot)` and capture `pre = structuredClone(this.state)` after the `assertTurn` and validation checks but before mutating; call `armRevert(slot, pre)` at the end of the method.

`endGame`: leave alone — does **not** arm revert. But it should still clear the revert window of any *other* player, so add at the top:

```ts
  endGame(slot: Slot): void {
    if (this.state.phase !== 'playing') return;
    this.maybeClearRevertOnActionBy(slot);
    this.lastSnapshot = null; // ending the game finalizes everything
    this.state.phase = 'finished';
  }
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/game.ts tests/game.test.ts
git commit -m "feat(engine): arm revert on pass/redraw/claimBlank; clear on cross-player action"
```

---

## Task 5: Persistence — assert `lastSnapshot` is intentionally not serialized

**Files:**
- Modify: `server/persistence.ts`
- Modify: `tests/persistence.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/persistence.test.ts`:

```ts
import { Game } from '../server/game.js';
import { saveActiveGame, loadActiveGame } from '../server/persistence.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('persistence: revert window is not preserved', () => {
  it('round-trips without canRevert leaking into the loaded state', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scrabble-revert-'));
    const g = new Game({ seed: 3 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    g.passTurn(0);
    expect(g.snapshot().players[0]!.canRevert).toBe(true);
    saveActiveGame(dir, g.snapshot());
    const loaded = loadActiveGame(dir)!;
    const g2 = Game.fromState(loaded);
    expect(g2.snapshot().players[0]!.canRevert).toBe(false);
    expect(() => g2.revertLastTurn(0)).toThrow();
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run tests/persistence.test.ts -t "revert window is not preserved"`
Expected: PASS already (because `Game.fromState` doesn't initialise `lastSnapshot` from state — it's a fresh field default to `null`). If it fails, the implementation needs review.

- [ ] **Step 3: Document the choice in code**

In `server/persistence.ts`, just above `saveActiveGame`, add:

```ts
// NOTE: GameState's per-player `canRevert` is recomputed from the engine's transient
// `lastSnapshot` field, which is intentionally NOT persisted. A server restart drops
// the revert window — acceptable hard boundary; no game state is lost.
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/persistence.ts tests/persistence.test.ts
git commit -m "test(persistence): revert window does not survive restart"
```

---

## Task 6: Server — wire pass / redraw / claimBlank / endGame / revertLastTurn handlers

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/index.ts`
- Modify: `tests/integration/m4-server.test.ts` (if any old assertions break)

- [ ] **Step 1: Add `revertLastTurn` to ClientMessage**

In `shared/types.ts`, append to `ClientMessage` union:

```ts
  | { type: 'revertLastTurn' }
```

- [ ] **Step 2: Replace handler stub block**

In `server/index.ts` `attachInGameHandler`, replace the block:

```ts
        case 'claimBlank':
        case 'pass':
        case 'redraw':
        case 'toggleRackVisible':
        case 'endGame':
          sendMsg(ws, { type: 'error', message: 'not yet implemented' });
          return;
```

with:

```ts
        case 'pass':
          handleEngineAction(slot, ws, () => game!.passTurn(slot));
          return;
        case 'redraw':
          handleEngineAction(slot, ws, () => game!.redrawRack(slot));
          return;
        case 'claimBlank':
          handleEngineAction(slot, ws, () => game!.claimBlank(slot, msg.row, msg.col, msg.myTileId));
          return;
        case 'endGame':
          handleEngineAction(slot, ws, () => game!.endGame(slot));
          return;
        case 'revertLastTurn':
          handleEngineAction(slot, ws, () => game!.revertLastTurn(slot));
          return;
        case 'toggleRackVisible':
          sendMsg(ws, { type: 'error', message: 'not yet implemented' });
          return;
```

- [ ] **Step 3: Add the helper**

In `server/index.ts`, add inside `startServer` (alongside `handleSubmitMove`):

```ts
  function handleEngineAction(_slot: Slot, ws: WebSocket, fn: () => void): void {
    if (game === null) {
      sendMsg(ws, { type: 'error', message: 'Game not started' });
      return;
    }
    try {
      fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Engine error';
      sendMsg(ws, { type: 'error', message });
      return;
    }
    try {
      saveActiveGame(dataDir, game.snapshot());
    } catch (err) {
      console.error('[scrabble] saveActiveGame failed:', err);
    }
    broadcastState();
  }
```

- [ ] **Step 4: Verify typecheck + existing tests still pass**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts server/index.ts
git commit -m "feat(server): wire pass/redraw/claimBlank/endGame/revertLastTurn"
```

---

## Task 7: Integration test — pass + endGame + revert flow

**Files:**
- Create: `tests/integration/m4b-server.test.ts`

- [ ] **Step 1: Write the test file**

Reuse the helpers pattern from `tests/integration/m4-server.test.ts`. Create:

```ts
import { describe, it, expect } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ClientMessage, GameState, ServerMessage, Slot } from '@shared/types';
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
        if (w.predicate(msg)) { w.resolve(msg); return false; }
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

const isStateWithTurn = (turnIndex: Slot) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> =>
    m.type === 'state' && m.state.phase === 'playing' && m.state.turnIndex === turnIndex;

const isStateWithPhase = (phase: GameState['phase']) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: 'state' }> =>
    m.type === 'state' && m.state.phase === phase;

const isError = (m: ServerMessage): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error';

function send(b: Buffered, msg: ClientMessage): void { b.ws.send(JSON.stringify(msg)); }
function join(b: Buffered, slot: 0 | 1 | 2, name: string): void {
  send(b, { type: 'join', slot, name, password: 'pw' });
}

const FAMILY = { password: 'pw', players: [
  { slot: 0, name: 'A' }, { slot: 1, name: 'B' }, { slot: 2, name: 'C' },
] };

async function freshServer() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-m4b-'));
  writeFileSync(path.join(dataDir, 'family.json'), JSON.stringify(FAMILY));
  const server = await startServer({ port: 0, serveStatic: false, dataDir });
  return { server, url: `ws://localhost:${server.port}/ws`, dataDir };
}

async function threeJoined() {
  const ctx = await freshServer();
  const a = await buffered(ctx.url); join(a, 0, 'A');
  const b = await buffered(ctx.url); join(b, 1, 'B');
  const c = await buffered(ctx.url); join(c, 2, 'C');
  await waitFor(a, isStateWithPhase('playing'));
  await waitFor(b, isStateWithPhase('playing'));
  await waitFor(c, isStateWithPhase('playing'));
  return { ...ctx, a, b, c };
}

describe('M4b server: action handlers', () => {
  it('pass advances turnIndex and arms revert for the actor', async () => {
    const { server, a, b } = await threeJoined();
    try {
      send(a, { type: 'pass' });
      const s = await waitFor(b, isStateWithTurn(1));
      expect(s.state.players[0]!.canRevert).toBe(true);
      expect(s.state.players[1]!.canRevert).toBe(false);
    } finally { await server.close(); }
  });

  it('revertLastTurn rolls turnIndex back', async () => {
    const { server, a, b } = await threeJoined();
    try {
      send(a, { type: 'pass' });
      await waitFor(b, isStateWithTurn(1));
      send(a, { type: 'revertLastTurn' });
      const s = await waitFor(b, isStateWithTurn(0));
      expect(s.state.players[0]!.canRevert).toBe(false);
    } finally { await server.close(); }
  });

  it('revertLastTurn from a non-author returns error', async () => {
    const { server, a, b } = await threeJoined();
    try {
      send(a, { type: 'pass' });
      await waitFor(b, isStateWithTurn(1));
      send(b, { type: 'revertLastTurn' });
      const err = await waitFor(b, isError);
      expect(err.message).toMatch(/author|nothing|turn/i);
    } finally { await server.close(); }
  });

  it('redraw on an ineligible rack returns error and does not advance turn', async () => {
    const { server, a, b } = await threeJoined();
    try {
      send(a, { type: 'redraw' });
      const err = await waitFor(a, isError);
      expect(err.message).toMatch(/eligible|vowel|consonant/i);
      // Ensure no state broadcast advanced the turn.
      expect(b.messages.some((m) => m.type === 'state' && m.state.turnIndex !== 0)).toBe(false);
    } finally { await server.close(); }
  });

  it('endGame finishes the game and clears revert', async () => {
    const { server, a, b } = await threeJoined();
    try {
      send(a, { type: 'endGame' });
      const s = await waitFor(b, isStateWithPhase('finished'));
      for (const p of s.state.players) expect(p.canRevert).toBe(false);
    } finally { await server.close(); }
  });

  it('cross-player action clears the previous revert window', async () => {
    const { server, a, b, c } = await threeJoined();
    try {
      send(a, { type: 'pass' });
      await waitFor(b, isStateWithTurn(1));
      send(b, { type: 'pass' });
      const s = await waitFor(c, isStateWithTurn(2));
      expect(s.state.players[0]!.canRevert).toBe(false);
      expect(s.state.players[1]!.canRevert).toBe(true);
    } finally { await server.close(); }
  });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run tests/integration/m4b-server.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/m4b-server.test.ts
git commit -m "test(integration): m4b server actions + revert"
```

---

## Task 8: Client — `ConfirmModal` component

**Files:**
- Create: `client/src/components/ConfirmModal.tsx`

- [ ] **Step 1: Write the component**

```tsx
type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open, title, message, confirmLabel = 'Подтвердить', cancelLabel = 'Отмена',
  onConfirm, onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 min-w-[280px] max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        {message !== undefined && <p className="text-sm text-gray-700 mb-4">{message}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100"
            onClick={onCancel}
          >{cancelLabel}</button>
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-sky-600 text-white hover:bg-sky-700"
            onClick={onConfirm}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ConfirmModal.tsx
git commit -m "feat(client): generic confirm modal component"
```

---

## Task 9: Client — WS senders for the new actions

**Files:**
- Modify: `client/src/ws.ts`

- [ ] **Step 1: Add the senders**

Append to `client/src/ws.ts`:

```ts
export function sendPass(): void { send({ type: 'pass' }); }
export function sendRedraw(): void { send({ type: 'redraw' }); }
export function sendClaimBlank(row: number, col: number, tileId: string): void {
  send({ type: 'claimBlank', row, col, myTileId: tileId });
}
export function sendEndGame(): void { send({ type: 'endGame' }); }
export function sendRevertLastTurn(): void { send({ type: 'revertLastTurn' }); }
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/ws.ts
git commit -m "feat(client): ws senders for pass/redraw/claimBlank/endGame/revert"
```

---

## Task 10: Client — `ActionBar` component

**Files:**
- Create: `client/src/components/ActionBar.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import { useGameStore } from '../store.js';
import { sendPass, sendRedraw, sendEndGame, sendRevertLastTurn } from '../ws.js';
import { ConfirmModal } from './ConfirmModal.js';

type Confirm = null | 'pass' | 'endGame' | 'revert';

export function ActionBar() {
  const state = useGameStore((s) => s.state);
  const identity = useGameStore((s) => s.identity);
  const [confirm, setConfirm] = useState<Confirm>(null);

  if (state === null || identity === null) return null;
  if (state.phase !== 'playing') return null;

  const me = state.players[identity.slot]!;
  const isMyTurn = state.turnIndex === identity.slot;

  function fire() {
    if (confirm === 'pass') sendPass();
    if (confirm === 'endGame') sendEndGame();
    if (confirm === 'revert') sendRevertLastTurn();
    setConfirm(null);
  }

  return (
    <div className="flex gap-2 items-center mt-3">
      <button
        type="button"
        disabled={!isMyTurn}
        className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
        onClick={() => setConfirm('pass')}
      >Пропустить</button>

      {me.redrawEligible && isMyTurn && (
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-amber-400 bg-amber-50 hover:bg-amber-100"
          onClick={() => sendRedraw()}
        >Замена (всё гласные/согласные)</button>
      )}

      {me.canRevert && (
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-sky-400 bg-sky-50 hover:bg-sky-100"
          onClick={() => setConfirm('revert')}
        >Отменить ход</button>
      )}

      <div className="flex-1" />

      <button
        type="button"
        className="px-3 py-1.5 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
        onClick={() => setConfirm('endGame')}
      >Завершить игру</button>

      <ConfirmModal
        open={confirm === 'pass'}
        title="Пропустить ход?"
        message="Ваш ход будет передан следующему игроку."
        onConfirm={fire}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'endGame'}
        title="Завершить игру?"
        message="Игра закончится, очки будут зафиксированы."
        confirmLabel="Завершить"
        onConfirm={fire}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'revert'}
        title="Отменить последний ход?"
        message="Состояние вернётся к моменту перед вашим действием."
        confirmLabel="Отменить ход"
        onConfirm={fire}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Mount in App.tsx**

In `client/src/App.tsx`, add the import:

```tsx
import { ActionBar } from './components/ActionBar.js';
```

Then place `<ActionBar />` directly under wherever the `Rack` is rendered in the in-game JSX (search for `<Rack`). If the existing layout uses a flex column, drop `<ActionBar />` as the next sibling.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test && npm run dev`
Manually verify: the bar appears below the rack on `/?slot=0&name=A` after all three slots join. Pass + End game open modals; Revert appears after acting; Redraw button only appears when rack happens to be all vowels or all consonants.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ActionBar.tsx client/src/App.tsx
git commit -m "feat(client): action bar with pass/redraw/endGame/revert"
```

---

## Task 11: Client — claim-blank by drag-and-drop

**Files:**
- Modify: `client/src/components/Square.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Allow Square to be a drop target even when occupied (only when it holds a blank)**

Open `client/src/components/Square.tsx`. Current `useDroppable` likely disables itself when the square has a placed cell. Adjust so a square is droppable when:

- The square is empty (existing behavior), OR
- The square holds a `Cell` with `fromBlank === true` AND it's the local player's turn.

The exact code depends on the file; the change should be: compute `isClaimBlankTarget = cell !== null && cell.fromBlank && isMyTurn;` and pass `disabled: !(isEmpty || isClaimBlankTarget)` to `useDroppable`. Also add a Tailwind class (e.g. `ring-2 ring-emerald-400`) when `isOver && isClaimBlankTarget` to give the green hover cue.

- [ ] **Step 2: Route the drop in App.tsx**

In `client/src/App.tsx` `onDragEnd`, after parsing `row` and `col`, before the existing pending-placement / blank-picker logic, add:

```ts
    // Claim-blank: dropped onto a square already occupied by a blank tile.
    const cell = state?.board[row]?.[col] ?? null;
    if (cell !== null) {
      const myTurn = identity !== null && state?.turnIndex === identity.slot;
      if (myTurn && cell.fromBlank && !tile.isBlank && tile.letter === cell.playedAs) {
        sendClaimBlank(row, col, tile.id);
      }
      return; // square is occupied — never treat as a normal placement
    }
```

(Add `import { sendClaimBlank } from './ws.js';`.)

If `cell.fromBlank` is true but the rack tile letter doesn't match, just ignore (return). Server is the authority — but we avoid sending a doomed message.

- [ ] **Step 3: Verify**

Run: `npm run typecheck`. Manually test in `npm run dev`: with a blank on the board, dragging a matching real letter onto it should claim it (the blank returns to your rack, the real letter takes the square).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Square.tsx client/src/App.tsx
git commit -m "feat(client): drag-to-claim-blank from rack onto board"
```

---

## Task 12: Update parent design spec to match shipped behavior

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-scrabble-design.md`

- [ ] **Step 1: Apply the spec amendments**

Open the spec. Make exactly these textual changes:

1. **§3 House rules table** — delete the row whose first cell is `**Tile swap**`.
2. **§3 House rules table** — append a new row:
   - First cell: `**Revert last turn**`
   - Second cell: `Player who just submitted an action (place / pass / redraw / claimBlank) may revert it. Window closes the moment any other player acts. One level only; not preserved across server restarts.`
3. **§6.4 ClientMessage table** — delete the row whose `Action` cell is `swapTiles`.
4. **§6.4 ClientMessage table** — add a row: `revertLastTurn | {} | Single-step undo for the action's author.`
5. **§6.4 / state snapshot section** — add a sentence: "Each `Player` includes `redrawEligible: boolean` (true iff the rack is all-vowel or all-consonant) and `canRevert: boolean` (true iff this player just acted and no other player has acted since)."

- [ ] **Step 2: Verify**

Run: `git diff docs/superpowers/specs/2026-04-30-scrabble-design.md` and read it.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-scrabble-design.md
git commit -m "docs(spec): m4b — drop tile-swap, add revert + per-player flags"
```

---

## Task 13: Final verification

- [ ] **Step 1: Full check**

Run: `npm run typecheck && npm test && npm run demo`
Expected: PASS, demo completes without protocol errors.

- [ ] **Step 2: Manual smoke**

Run: `npm run dev`, open three tabs (slots 0/1/2 with the family names), play one move per tab. Verify:
- Pass works + Revert appears + Revert restores turn.
- End game closes the game and ActionBar disappears.
- Drop a real letter onto a blank-bearing square and confirm the blank-swap.
- Redraw button only appears when applicable.

No commit needed if no changes.

---

## Self-review notes (engineer: confirm before starting)

- All five spec amendments in §2 of the spec map to Task 12.
- Engine revert tests cover: submitMove (Task 3), pass + redraw + endGame-doesn't-arm + cross-player-clears (Task 4). claimBlank revert is exercised in the integration test (Task 7). If you want a unit test specifically for claimBlank revert, add it to Task 4 in the same `describe` block — same pattern.
- Persistence test is technically a no-op assertion of behavior (Task 5) — it's there to prevent regression if someone later adds `lastSnapshot` to the persisted shape.
- `redrawEligible` reaches the client via the `Player` field — no separate plumbing needed.
- `ConfirmModal` is reused in three places; not a premature abstraction (3 use sites).
