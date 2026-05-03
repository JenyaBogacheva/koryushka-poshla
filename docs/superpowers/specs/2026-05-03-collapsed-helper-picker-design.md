# Post-hoc "Кто помог?" attribution

**Date:** 2026-05-03 (revised)
**Scope:** Client + server. Helper attribution moves out of the submit flow entirely.

## Problem

The submit-confirm modal currently asks "Кто помог?" on every play. In practice helping is occasional, so the prompt is friction in the common case. The user wants the submit flow to be just "Походить?" — no extra windows, no extra questions — and helper attribution to be optional, post-hoc, and out of the main flow.

## Goal

Remove the helper picker from the submit modal. Allow the actor of the latest move to attribute (or change, or clear) a helper after the fact, from the move log, until any subsequent event makes the move no longer "the latest."

## Behavior

### Submit modal
- No helper UI. Layout: title "Походить?", tile count, Отмена / Походить.

### Move log
The most recent move owned by the local player gets a helper affordance, but only while that move is still the latest event (i.e., no subsequent move, pass, swap, or other state-changing event has occurred).

- **No helper yet:** small `+ кто помог?` button under the move row.
- **Helper attributed:** existing `↳ помог<имя> — +5` line, but the name is a button (re-opens picker) and a small `✕` clears.
- **Picker:** inline expansion in the log row with the same radio list (никто / playerA / playerB). Selecting "никто" clears.
- **Locked:** once any subsequent event happens, the affordance disappears. The line, if any, becomes static.

Only the actor of that move sees the affordance. Other players see the existing static rendering.

## Protocol

New client → server message:

```ts
{ type: 'attributeHelper'; helperSlot: Slot | null }
```

No `moveIndex` field — the server always targets the latest move (this is what "most recent" means).

### Server validation
The handler must reject with a typed error if:
- `phase !== 'playing'`.
- The latest event is not a `move`, or there is a non-assist event after that move.
- The sender is not the actor of that move.
- `helperSlot === actorSlot`.

### Server state changes
1. If the move already has a helper, find and remove the corresponding `assist` event (`forMoveIndex === moveIndex`) and subtract 5 from that helper's score.
2. If the new `helperSlot` is non-null, push a new `assist` event and add 5 to the new helper's score.
3. Set `move.helperSlot` to the new value (`null` if cleared).
4. Persist; broadcast new state.

### `submitMove` cleanup
- `submitMove` no longer accepts `helperSlot`. Move records still have `helperSlot: Slot | null` (defaults to `null` on submit) — only attribution can set it.
- The `submit_move` WS message no longer carries `helperSlot`.
- `pendingHelperSlot` is removed from the client Zustand store.
- The `'invalid-helper'` error variant is reused by the new attribute handler.

### Revert window
The existing revert window covers the actor's last move. Helper attribution is treated as part of that window: a revert wipes the move and any associated assist regardless of whether the helper was attributed inline or post-hoc. (Operationally this falls out for free because attribution mutates the same move record + appends/removes the same assist event the move would have produced inline.)

## Files

### Server
- `server/game.ts` — drop `helperSlot` from `submitMove`; add `attributeHelper(slot, helperSlot)` returning a discriminated result. Reuse `'invalid-helper'` error kind; add new `'no-attributable-move'` and `'not-your-move'` error kinds.
- `server/index.ts` — handle the new WS message; route errors to existing user-facing string formatter.

### Client
- `client/src/components/SubmitConfirmModal.tsx` — remove helper UI; restore to plain confirm modal.
- `client/src/components/MoveLog.tsx` — render the affordance on the latest move when conditions met; expose a callback or use the store directly to send `attributeHelper`.
- `client/src/store.ts` — drop `pendingHelperSlot` / `setPendingHelperSlot`; expose an `attributeHelper(slot)` action that sends the WS message.
- `client/src/ws.ts` — wire the new message; existing `state` push handles re-render.

### Shared
- `shared/types.ts` — add the new `attributeHelper` variant to the client→server union; no change to `MoveRecord` shape.

## Tests

Add `tests/attribute-helper.test.ts` with at least:
- Set helper on the latest move from `null` → score adjusts, assist event appended.
- Change helper from A to B → A's +5 reverted, B's +5 applied, assist event replaced.
- Clear helper → +5 reverted, assist event removed, `move.helperSlot` becomes `null`.
- Non-actor attempts attribution → rejected.
- Self-attribution (`helperSlot === actorSlot`) → rejected.
- Attribution after a subsequent move → rejected.
- Self-revert preserved: revert after attribute_helper still wipes assist + score.

Existing tests that exercise `submitMove(..., helperSlot)` are migrated: split each into a `submitMove(...)` call + an `attributeHelper(...)` call where the helper is non-null.

## Non-goals

- Editing helper on older moves.
- UI for non-actor players to claim/dispute helping.
- Bulk or end-of-game attribution.
