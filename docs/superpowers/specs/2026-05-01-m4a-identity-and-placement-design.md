# M4a — Identity & Placement Completion

**Date:** 2026-05-01
**Milestone:** First half of M4 (`docs/superpowers/specs/2026-04-30-scrabble-design.md` §12). M4b (non-placement actions: pass, swap, redraw, claimBlank, endGame, toggleRackVisible) is a separate spec.
**Status:** Draft.

## 1. Scope

### In scope

- Replace `?slot=N&name=X` URL-param identity stub with a real lobby flow: client opens an unauthenticated WS, receives a `lobby` snapshot, sends a `join` message with `{slot, name}`. Identity persists in `localStorage`.
- `<SlotPicker>` UI rendered when no stored identity exists or when the server rejects `join`.
- Server reconnect-by-name (spec §10) with **live same-name takeover**: a second connection on the same slot with the same name closes the existing ws and seats the new one.
- Multi-spot placement enabled end-to-end (server already validates; client must not gate on single-group placements).
- Blank picker: modal letter selector shown when a blank tile is dropped on the board.
- Substitution toggle: tiles whose physical letter is Ё/Ъ/Ш/Й show an in-place toggle to switch `playedAs` between the real and substitute letter (default: real letter).
- Dictionary advisory display: `dictionaryWarnings` from `moveAccepted` shown in a warning-style `ErrorBanner` for ~5 s.

### Out of scope (M4b)

- `pass`, `swapTiles`, `redraw`, `claimBlank`, `endGame`, `toggleRackVisible` — server still replies `not yet implemented`.

## 2. WS protocol additions (`shared/types.ts`)

```ts
export type LobbySlot = { slot: Slot; name: string; connected: boolean };

export type ClientMessage =
  | { type: 'join'; slot: Slot; name: string }                  // NEW
  | { type: 'submitMove'; placements: Placement[] }
  | { type: 'swapTiles'; tileIds: string[] }
  | { type: 'claimBlank'; row: number; col: number; myTileId: string }
  | { type: 'pass' }
  | { type: 'redraw' }
  | { type: 'toggleRackVisible'; visible: boolean }
  | { type: 'endGame' };

export type ServerMessage =
  | { type: 'lobby'; slots: [LobbySlot, LobbySlot, LobbySlot] }  // NEW
  | { type: 'state'; state: GameState }
  | { type: 'moveAccepted'; moveRecord: MoveRecord; dictionaryWarnings: string[] }
  | { type: 'moveRejected'; reason: string }
  | { type: 'error'; message: string };
```

### Connection lifecycle

1. Client opens `ws://host/ws` (no query params).
2. Server immediately sends a `lobby` message with the current 3-slot occupancy.
3. Client sends `{type: 'join', slot, name}`.
4. Server validates and responds with either `state` (success) or `error: 'Slot taken'` (and closes).
5. Pre-join, any non-`join` client message returns `error: 'Join first'`. The ws stays open so the client can retry.

### Server-side `join` validation

Accept if **any** holds:
- The slot is free (`seats[slot].ws === null`) AND, if a persisted game exists, the persisted name for that slot is empty OR matches.
- The slot is held by a disconnected player whose stored/persisted name matches.
- The slot is held by an *open* ws and the name matches → **live takeover**: close the existing ws with code `1000` and reason `'replaced by same-name client'`; seat the new ws.

Reject otherwise with `error: 'Slot taken'` and close the new ws.

## 3. Server changes

### `server/connections.ts`

`seat(seats, slot, name, ws)` is extended:

- If `seats[slot].ws !== null` and `seats[slot].name === name`: close the existing ws with code `1000`, reason `'replaced by same-name client'`, then atomically replace the entry. Returns `{ ok: true, replaced: true }`.
- If `seats[slot].ws !== null` and names differ: returns `{ ok: false, reason: 'Slot taken' }`.
- Otherwise: existing behavior.

`unseat(seats, ws)` is unchanged. (When live takeover closes the old ws, its `close` handler runs after replacement; we identify-by-ws-reference so it must no-op when the seat already points at a different ws.)

### `server/index.ts`

Split `wss.on('connection')` into two phases:

```text
on connection:
  send lobby snapshot
  attach pre-join message handler

pre-join handler (only 'join' allowed):
  if msg.type !== 'join': error 'Join first'; return
  validate name (non-empty, trimmed)
  if game !== null and persisted name conflicts: error 'Slot taken'; close
  result = seat(seats, slot, name, ws)
  if !result.ok: error result.reason; close
  if game === null and allSeated(seats): create game, deal, save
  if game !== null: game.joinPlayer(slot, name)
  swap to in-game message handler
  broadcast state
```

The in-game handler is exactly today's `switch (msg.type)` block. The pre-join handler is small and lives inline.

`lobbySnapshot()` is unchanged (still used for the synthetic `state` when no game has started). New helper `lobbyMessage()` builds the `{type: 'lobby', slots}` payload from `seats`.

### Tests

- `tests/connections.test.ts`:
  - Live same-name takeover: existing ws closes with `1000`/`'replaced by same-name client'`; seats reflects the new ws.
  - Same slot, different name → `{ ok: false, reason: 'Slot taken' }`, original ws untouched.
  - Re-seating after `unseat` (existing behavior, kept).
- `tests/integration/m4-server.test.ts` (new):
  - Open ws → receive `lobby` → send unknown message → `error: 'Join first'`, ws still open.
  - Open ws → `join` → receive `state` → reload (new ws) with same name → live takeover succeeds, original ws sees close.
  - Three clients join, multi-spot two-group `submitMove` accepted, snapshot shows both groups.
  - Client `join`s with name mismatching persisted game state → `error: 'Slot taken'`, ws closed.

## 4. Client identity flow

### `client/src/store.ts`

```ts
type GameStore = {
  // existing
  lobby: LobbySlot[] | null;
  identity: { slot: Slot; name: string } | null;
  warning: string | null;            // dictionary advisory
  setIdentity(slot: Slot, name: string): void;   // persists to localStorage
  clearIdentity(): void;             // removes localStorage entry
  setLobby(slots: LobbySlot[]): void;
  setWarning(msg: string | null): void;
};
```

- `setIdentity` writes `{slot, name}` to `localStorage['scrabble.identity']`.
- On store creation, hydrate `identity` from `localStorage`.

### `client/src/ws.ts`

- `connect()` opens plain `/ws` (no query string).
- New `sendJoin(slot, name)` sends `{type:'join', slot, name}`.
- On message `lobby` → `setLobby`.
- On message `error` with `'Slot taken'`: `clearIdentity()` so the slot picker re-renders.
- On message `moveAccepted` with `dictionaryWarnings.length > 0`: `setWarning(...)` and start a 5 s clear timer (cleared on next warning or next move).

### `client/src/App.tsx`

Replaces today's URL-param gate:

```text
on mount:
  connect()

render:
  if !connected: "connecting..."
  if !lobby and !state: "waiting..."
  if !identity:
    if state and state.phase === 'playing' and no free/own slot: "Game in progress" message
    else <SlotPicker lobby={lobby} onJoin={(slot, name) => { setIdentity; sendJoin }} />
  else if !state: "joining..."
  else: <Game />   // existing main UI
```

Auto-rejoin: when `identity` is present and `connected` becomes true, fire `sendJoin(identity.slot, identity.name)` once.

### New: `client/src/components/SlotPicker.tsx`

Stateless: takes `lobby: LobbySlot[]` and `onJoin(slot, name)`. Renders three rows. For each slot:
- Free → "Свободно" + name input + Join button (enabled when name is non-empty after trim).
- Claimed by name X, connected → disabled.
- Claimed by name X, disconnected → "X (отключился)" with a name input prefilled to X and a Join button. If the typed name equals X the server accepts (reconnect-by-name); otherwise it rejects with `'Slot taken'` and the picker re-renders.

### New: `client/src/letters.ts`

```ts
export const CYRILLIC_LETTERS: Letter[] = [
  'А','Б','В','Г','Д','Е','Ё','Ж','З','И','Й','К','Л','М','Н','О','П',
  'Р','С','Т','У','Ф','Х','Ц','Ч','Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я'
];

export const SUBSTITUTIONS: Record<Letter, Letter> = {
  'Ё': 'Е', 'Ъ': 'Ь', 'Ш': 'Щ', 'Й': 'И'
};
```

Intentional duplication of the server-side list; KISS, both are tiny constants.

### Delete

- `client/src/MissingParams.tsx` — no longer used.

## 5. Multi-spot placement

Server already supports it. Client audit: confirm `App.tsx` / `store.ts` do not gate the submit button on `pendingPlacements.length === 1` or assume a single connected group. No code changes expected; integration test in §3 covers it.

## 6. Blank picker

### New: `client/src/components/LetterPicker.tsx`

Modal. Props: `letters: Letter[]`, `title: string`, `onPick(letter)`, `onCancel()`. Renders a 6-column grid of buttons. ESC and backdrop click trigger `onCancel`.

### Wire-up in `App.tsx`

In `onDragEnd`: if the dragged tile is a blank (`isBlank: true`), open the picker with `CYRILLIC_LETTERS` instead of immediately calling `addPending`. On pick, call `addPending({tileId, row, col, playedAs: picked})`. On cancel, drop the drag.

For non-blank tiles, the existing `playedAs = tile.letter` default in `addPending` is preserved.

## 7. Substitution toggle

When a placed tile (in pending state) has `tile.letter ∈ {Ё, Ъ, Ш, Й}`, render a small badge (e.g., circled "Е") on the tile. Clicking the badge toggles `playedAs` between `tile.letter` and `SUBSTITUTIONS[tile.letter]`. Default `playedAs = tile.letter`.

State: extend pending-placement editing API in `store.ts`: `togglePendingSubstitution(tileId)`. Server sees the final `playedAs` on submit; existing server logic handles validation.

No modal. The badge only appears for the four sub-eligible letters.

## 8. Dictionary advisory

Extend `ErrorBanner` props:

```ts
type ErrorBannerProps = { kind?: 'error' | 'warning' };
```

Default `'error'` (red, current styling). `'warning'` is yellow.

`store.ts` adds `warning: string | null` and `setWarning(msg)`. On `moveAccepted` with `dictionaryWarnings.length > 0`, set `warning` to "Не в словаре: <comma-separated>" and start a 5 s timer to clear it. The next `moveAccepted` clears any pending timer first.

`App.tsx` renders the warning banner *in addition to* (above) the error banner when both are present.

## 9. Files touched

| Path | Change |
|---|---|
| `shared/types.ts` | Add `join` / `lobby` messages, `LobbySlot` |
| `server/index.ts` | Split connection / join phases; route `join`; remove URL-param parsing |
| `server/connections.ts` | Live-takeover branch in `seat()` |
| `tests/connections.test.ts` | Add takeover tests |
| `tests/integration/m4-server.test.ts` | New — full join + multi-spot flow |
| `client/src/App.tsx` | Slot-picker gate, drop URL params, warning banner |
| `client/src/store.ts` | `identity`, `lobby`, `warning`, `togglePendingSubstitution` |
| `client/src/ws.ts` | Plain connect, `sendJoin`, lobby/warning handlers |
| `client/src/components/SlotPicker.tsx` | New |
| `client/src/components/LetterPicker.tsx` | New |
| `client/src/components/Tile.tsx` | Substitution toggle badge |
| `client/src/components/ErrorBanner.tsx` | `kind` prop |
| `client/src/letters.ts` | New (33-letter list, sub map) |
| `client/src/MissingParams.tsx` | Deleted |

## 10. Testing strategy

- **Server unit (vitest):** live-takeover and `Slot taken` cases in `tests/connections.test.ts`.
- **Integration (vitest + ws):** new `tests/integration/m4-server.test.ts` covers (a) lobby on connect, (b) `Join first` on premature messages, (c) `join` success → `state`, (d) live takeover, (e) reconnect-by-name after disconnect, (f) multi-spot two-group `submitMove`, (g) name-mismatch rejection.
- **Manual UI:** slot picker first visit → join → reload preserves identity → blank picker shows on blank drop → substitution badge toggles → unknown-word warning banner appears for ~5 s.

## 11. Open questions

None at spec time. (M4b spec will pick up the deferred actions.)
