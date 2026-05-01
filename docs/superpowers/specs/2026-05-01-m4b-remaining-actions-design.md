# M4b — Remaining Rule Actions Design

**Status:** approved 2026-05-01
**Predecessor:** M4a (lobby + placement completion)
**Successor:** M5 (polish + deploy)

## 1. Goal

Wire up the remaining turn actions end-to-end (engine → server WS handler → client UI), remove the standard tile-swap rule entirely, and add a single-step "revert last turn" affordance for the move's author.

## 2. Spec changes (parent design doc)

The following amendments must be made to `docs/superpowers/specs/2026-04-30-scrabble-design.md` as part of M4b:

- **§3 "House rules" — delete the row "Tile swap".** This variant does not support standard tile-swap. Free redraw (all-vowel/all-consonant) is the only rack-refresh mechanism.
- **§3 — add new row "Revert last turn"**: *The player who just submitted an action (place / pass / redraw / claimBlank) may revert it, restoring the pre-action state. The window closes the moment any other player submits any action. One level of undo only; not persisted across server restarts.*
- **§6.4 Protocol — `ClientMessage`:**
  - Remove the `swapTiles` variant.
  - Add `{ type: 'revertLastTurn' }`.
- **§6.4 — server snapshot:** add a per-player boolean `canRevert` to the player's view.

## 3. Action inventory (post-M4b)

| Action | Trigger | Ends turn? | Notes |
|---|---|---|---|
| `submitMove` | Submit button after placing tiles | yes | Already shipped (M3). |
| `pass` | ActionBar → "Pass" → confirm | yes | New in M4b. |
| `redraw` | ActionBar → "Redraw" (visible only when eligible) | **no** | New in M4b. |
| `claimBlank` | Drag rack tile onto a blank-bearing board square | no (continues turn) | New in M4b. |
| `endGame` | ActionBar → "End game" → confirm | game ends | New in M4b. |
| `revertLastTurn` | ActionBar → "Revert" (visible only when `canRevert`) → confirm | reverses last action | New in M4b. |

## 4. Engine changes (`server/`)

### 4.1 Remove `swapTiles`
- Delete `Game.swapTiles` from `server/game.ts`.
- Delete `swapTiles` tests from `tests/game.test.ts`.
- Remove `swapTiles` variant from `shared/types.ts`.
- Remove the `case 'swapTiles'` branch from `server/index.ts`.

### 4.2 Revert support
- Add a private field `lastSnapshot: { state: SerializedGame; bySlot: Slot } | null` to `Game` (where `SerializedGame` is whatever `persistence.ts` already produces — reuse that serializer to keep the snapshot path single-sourced).
- Before mutating state in `submitMove`, `passTurn`, `redrawRack`, `claimBlank`, capture the current serialized state into `lastSnapshot` with `bySlot = slot`.
- At the **start** of any of those four methods (and `revertLastTurn`), if `lastSnapshot !== null` and `lastSnapshot.bySlot !== slot`, set `lastSnapshot = null` (the prior turn is now final). The acting player's *own* repeat action (e.g. `claimBlank` then `submitMove` in the same turn) overwrites the snapshot, so they can revert the most recent step but not multiple steps.
- New method `revertLastTurn(slot: Slot): void`:
  - Throws if `lastSnapshot === null` or `lastSnapshot.bySlot !== slot`.
  - Restores state from the snapshot via the existing deserializer.
  - Clears `lastSnapshot = null`.
- `endGame` does **not** populate `lastSnapshot` and is not revertible (intentional — ending the game is final, single confirmation modal already guards it).

### 4.3 Snapshot exposure
- The per-player view emitted by the snapshot builder gains `canRevert: boolean`, computed as `lastSnapshot !== null && lastSnapshot.bySlot === slot`.

### 4.4 Persistence
- `lastSnapshot` is **not** serialized to disk. A server restart is an acceptable hard boundary: the player loses their revert window but no game state is lost. Document this in code with a one-line comment.

## 5. Server WebSocket handler (`server/index.ts`)

Replace the `not yet implemented` cases for `pass`, `redraw`, `claimBlank`, `endGame` with calls into the corresponding `Game` method, then broadcast a fresh snapshot. Add a new case for `revertLastTurn` doing the same. Errors thrown by the engine are caught and returned as `{ type: 'error', message }` to the originating client only.

## 6. Client changes (`client/`)

### 6.1 New component `ActionBar.tsx`
- Anchored below the rack, always visible during `playing` state.
- Buttons:
  - **Pass** — disabled when not your turn. Click → confirm modal → `sendPass()`.
  - **Redraw** — *visible only* when `me.redrawEligible === true`. (No confirm — free action.)
  - **End game** — always enabled. Click → confirm modal → `sendEndGame()`.
  - **Revert** — *visible only* when `me.canRevert === true`. Click → confirm modal → `sendRevertLastTurn()`.

Confirm modal reuses the existing modal pattern (`LetterPicker`-style — backdrop + small card + Cancel/Confirm).

### 6.2 Claim-blank interaction
- Extend the existing dnd-kit drop targets in `Board.tsx` / `Square.tsx`: a square already containing a blank tile becomes a valid drop target for a rack tile **iff** the rack tile's letter matches the blank's `letterAs` and it's the local player's turn.
- On drop, send `{ type: 'claimBlank', row, col, myTileId }`. Server validates fully and returns either an updated snapshot or an `error`.
- Visual cue: the blank square highlights green when a matching rack tile is being dragged over it.

### 6.3 Store / WS plumbing (`client/src/ws.ts`, `client/src/store.ts`)
- Add `sendPass()`, `sendRedraw()`, `sendClaimBlank(row, col, tileId)`, `sendEndGame()`, `sendRevertLastTurn()`.
- Pull `redrawEligible` and `canRevert` from the per-player snapshot field.

### 6.4 End-of-game state
- When the snapshot reports `phase: 'finished'`, ActionBar hides; the existing read-only board stays. (A polished end-game scoreboard / "play again" flow is M5; M4b just needs the game to come to a clean stop.)

## 7. Testing

### 7.1 Engine unit tests (`tests/game.test.ts`)
- Revert after `submitMove` restores board, rack, bag, score, turn pointer.
- Revert after `pass` restores turn pointer.
- Revert after `redraw` restores rack and bag (drawn tiles go back).
- Revert after `claimBlank` restores both racks and the board square.
- Revert rejected when caller is not the action's author.
- Revert rejected when another player has acted (snapshot cleared).
- `endGame` does not arm revert.
- Same player acting twice (claimBlank then submitMove) — only the most recent step is revertible.

### 7.2 Persistence test (`tests/persistence.test.ts`)
- After save → load, `lastSnapshot` is `null` (revert window does not survive restart).

### 7.3 Integration test (`tests/integration/m4b-server.test.ts`)
- Three fake WS clients. Cover: pass, redraw (eligible + ineligible-error), claimBlank (success + ineligible-error), endGame (game ends, ActionBar would hide), revert happy path, revert rejected when another player has acted.
- Removed: any `swapTiles` paths.

### 7.4 Snapshot fields
- `tests/snapshot.test.ts` (or wherever the per-player view is asserted): assert `canRevert` is true for the last actor immediately after their action and false for everyone else; flips to false for everyone after another player acts.

## 8. Out of scope for M4b

- Rack visibility toggle (deferred to M5).
- End-game scoreboard / "play again" flow (M5).
- Multi-level undo / redo stack.
- Dictionary advisory styling (shipped in M4a).
- Persisting `lastSnapshot` across server restarts.

## 9. File plan

| Path | Change |
|---|---|
| `docs/superpowers/specs/2026-04-30-scrabble-design.md` | Apply §2 amendments. |
| `shared/types.ts` | Drop `swapTiles`; add `revertLastTurn`; add `canRevert` to per-player view. |
| `server/game.ts` | Delete `swapTiles`; add `lastSnapshot` field + `revertLastTurn` + snapshot-clearing logic in pass/redraw/claimBlank/submitMove. |
| `server/index.ts` | Replace stubs with real handlers; delete `swapTiles` case; add `revertLastTurn` case. |
| `server/persistence.ts` | One-line comment that `lastSnapshot` is intentionally not persisted. |
| `tests/game.test.ts` | Drop swap tests; add revert tests. |
| `tests/persistence.test.ts` | Add `lastSnapshot` non-persistence assertion. |
| `tests/integration/m4b-server.test.ts` | New — see §7.3. |
| `tests/snapshot.test.ts` | Add `canRevert` assertions. |
| `client/src/components/ActionBar.tsx` | New. |
| `client/src/components/Board.tsx`, `Square.tsx` | Extend drop targets for claim-blank. |
| `client/src/ws.ts` | New `send*` helpers. |
| `client/src/store.ts` | Surface `redrawEligible` / `canRevert` if not already. |
