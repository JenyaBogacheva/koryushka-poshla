# Collapsed "Кто помог?" picker in submit modal

**Date:** 2026-05-03
**Scope:** Client-only UI tweak. No server, protocol, or data model changes.

## Problem

The submit-confirm modal (`SubmitConfirmModal.tsx`) currently shows the "Кто помог?" fieldset with a full radio list (никто / player / player) every time a player confirms a move. Helper attribution happens only *sometimes* in actual play, so the prompt is visually heavy for the common case where nobody helped.

## Goal

De-emphasize helper attribution without removing it. Default to a collapsed, low-visual-weight control that expands on demand, while preserving the choice if the user makes one.

## Behavior

The `<fieldset>` containing the "Кто помог?" legend and radio list is replaced by a single line that has three visual states:

1. **Collapsed, no helper chosen (default).** A muted text link/button reading `+ кто-то помог?`. Sits between the tile-count line and the action buttons.
2. **Expanded.** Clicking the link reveals the existing radio list inline (никто / player A / player B). The link itself disappears while expanded. No animation; instant toggle.
3. **Collapsed with helper chosen.** If the user expanded the picker, chose a player, and then collapsed it, show a small chip: `помог: <Имя> ✕`. Clicking the `✕` clears the helper back to `null` and returns to state 1.

Selecting "никто" while expanded is equivalent to clearing — collapsing afterward returns to state 1, not state 3.

## State

- A new component-local `useState<boolean>` for `expanded`. Default `false`.
- Existing `pendingHelperSlot` in the Zustand store is unchanged. It continues to drive the radio list and the submit payload.
- When the modal closes (confirm or cancel), `pendingHelperSlot` must be reset to `null`. Verify the cancel path also clears it; if not, add the reset (otherwise out of scope).

## Non-changes

- No change to the WebSocket protocol or the submit payload — `helperSlot` is still sent the same way.
- No change to the move log rendering of `↳ помог<...>`.
- No change to `pendingHelperSlot` semantics in the store.
- No new tests. This is a presentational change in a single component with no engine logic.

## Files touched

- `client/src/components/SubmitConfirmModal.tsx` — only file modified.

## Russian-language strings

- Collapsed link: `+ кто-то помог?`
- Chip: `помог: <Имя>` with an `✕` clear button (use feminine form `помогла` if `<Имя>` ends in `а`/`я`, matching the helper logic already in `MoveLog.tsx:168` — extract the `femEnding` helper to a shared util only if reuse is trivial; otherwise duplicate the few lines, per the project's "wait for the third use site" rule).
