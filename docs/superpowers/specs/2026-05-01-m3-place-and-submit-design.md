# M3 — Place-and-Submit Design

**Status:** Draft, 2026-05-01
**Predecessor:** M2 (read-only client) is complete; server runs a scripted game and the client renders snapshots.
**Successor:** M4 (full lobby UI + remaining rule actions).
**Spec reference:** `docs/superpowers/specs/2026-04-30-scrabble-design.md` (game spec is source of truth).

## 1. Goal

End of M3: a developer can open three browser tabs, each with a different `?slot=N&name=…` URL, and play a Scrabble game by dragging tiles from rack to board and clicking Submit. The server validates moves, persists state, and broadcasts snapshots. Single-spot placement only; no substitutions, no blanks usable, no swap/pass/redraw/endGame UI yet.

This is the first milestone with real client→server messages. M1 + M2 stay intact under the new layer.

## 2. Scope

**In scope:**

- Server accepts `submitMove` from a connected, in-turn player; validates via the M1 engine; broadcasts new snapshots; persists after every accepted move.
- Server seats players by URL query (`/ws?slot=N&name=…`) and starts the game when all three slots are connected (per game-spec §10 #4).
- Persistence: load `data/game.json` on boot if present; save after every accepted move; archive to `data/history/<id>.json` only on game finish (deferred to M5; not in M3).
- Client reads `slot` and `name` from `URLSearchParams`, opens `/ws` with them, dispatches `submitMove`.
- Drag-and-drop: rack tile → empty board square, with recall (single tile) and recall-all.
- Submit / Recall All buttons in the in-turn player's card.
- Visual ghost state for pending placements; error banner for `moveRejected`.
- Integration test covering: seating, start-on-3, accepted move, rejected move, reconnect-by-name, slot conflict.

**Out of scope (deferred to M4 unless noted):**

- Slot picker UI, name input form, `localStorage`-based reconnect.
- Multi-spot placement UI (engine already supports it; M3 client only sends one connected line).
- Substitution picker (Ё→Е, Ъ→Ь, Ш→Щ, Й→И).
- Blank picker, blank-swap (`claimBlank`).
- `swapTiles`, `pass`, `redraw`, `toggleRackVisible`, `endGame` UI; server replies `error: "not yet implemented"` for these in M3.
- Dictionary warnings display (engine still stubs `dictionaryWarnings: []`).
- Final-game archival flow (M5).

## 3. Server Architecture

### 3.1 Boot path

`server/index.ts` boot:

1. If `data/game.json` exists, load via `loadActiveGame(dataDir)` (already in `server/persistence.ts`) → `GameState | null`. Reconstruct via a new `Game.fromState(state)` constructor (see §3.6). Phase may be any of `'waiting' | 'playing' | 'finished'`.
2. Else: hold no `Game` yet — server is in a "lobby" state with three empty seats.
3. Stop auto-running `runScriptedGame`. The scripted runner stays in `server/scripted-game.ts` for `npm run demo` only.

### 3.2 Connection seating (`server/connections.ts`, new)

Tracks for each `Slot 0|1|2`:

- `ws: WebSocket | null` — current live socket.
- `name: string | null` — name of the seated player (sticky across disconnects).

On `ws` upgrade, parse `slot` (`'0'|'1'|'2'`) and `name` (non-empty string) from the URL query.

- If `slot` is invalid or `name` missing → close with code 1008 and reason `"Bad join params"`.
- Else, attempt to seat per game-spec §10 #3:
  - Seat is empty → seat and store the name.
  - Seat is held by the same `name` (case-sensitive trim) and `ws` is null (disconnected) → re-seat the new socket.
  - Seat is held by a different name, **or** held by the same name but with a live `ws` → send `{type:'error', message:'Slot taken'}` then close.
- On success: send the current `state` snapshot (or a synthetic empty `'waiting'` state if no Game yet); broadcast updated `state` to other connected players (their view of `players[i].connected` changes).

When all three seats have been seated at least once **and** no Game exists yet, create the Game: `new Game({ seed: Date.now() })`, then `game.joinPlayer(slot, name)` for each slot, then `game.startGame()`. Persist, broadcast.

If a Game already exists (loaded from disk), seating just attaches sockets to existing slots; names from the URL must match the names already in the saved game's `players[i].name`, else `"Slot taken"`. On reconnect, also call `game.joinPlayer(slot, name)` to flip `connected` back to `true`.

On socket close: clear `ws` for that slot, leave `name` set, broadcast a snapshot so others see `connected: false`. Game persists; play resumes when the player reconnects.

### 3.3 Message dispatch

Per-message JSON parse with try/catch. Unknown `type` → reply `{type:'error', message:'Unknown message type'}` to sender, do not close.

Handled in M3:

- `submitMove`: see §3.4.

Replied to with `{type:'error', message:'not yet implemented'}` in M3 (forward-compatible stubs):

- `swapTiles`, `claimBlank`, `pass`, `redraw`, `toggleRackVisible`, `endGame`.

The `join` message from game-spec §8 is **not** used in M3 — identity is encoded in the WS connection URL. M4 introduces the in-band `join` for the slot picker.

### 3.4 `submitMove` handler

Inputs: `{ placements: Placement[] }` from sender at slot `s`.

1. If no Game exists yet → `error: "Game not started"`.
2. If `state.phase !== 'playing'` → `error: "Game not in progress"`.
3. If `state.turnIndex !== s` → `error: "Not your turn"`.
4. Call `game.submitMove(s, placements)`. The engine returns either `{ ok: true, moveRecord }` or `{ ok: false, error: MoveError }`.
5. On `ok`:
   - Persist via `saveGame()`.
   - Broadcast `{type:'state', state: redactedState(slot)}` to each connected client (redaction is a stub in M3 — racks always visible; M4 will respect `rackVisible`).
   - Send `{type:'moveAccepted', moveRecord, dictionaryWarnings: []}` to sender only.
6. On `!ok`:
   - Send `{type:'moveRejected', reason: humanReadableReason(error)}` to sender only.
   - Do not modify state, do not persist, do not broadcast.

`humanReadableReason` maps each `MoveError.kind` to a short Russian string (e.g., `'off_grid'` → `"Плитка вне поля"`, `'disconnected'` → `"Слова должны соединяться с уже сыгранными"`, `'gap'` → `"В слове есть пропуск"`, `'first_move_off_center'` → `"Первый ход должен закрывать центральную клетку"`).

### 3.5 Persistence

- `saveActiveGame(dataDir, state)` already exists in `server/persistence.ts`; it writes `data/game.json` synchronously. **Modify** it to write atomically (write to `data/game.json.tmp`, then `fs.rename`) — single small change.
- `loadActiveGame(dataDir)` already exists; returns `GameState | null`.
- After every accepted move: `saveActiveGame(dataDir, game.snapshot())`. Synchronous and called before broadcast — if save throws, the move still lands in memory but we log and continue (personal project; spec acceptance is "good enough").
- M3 does **not** archive on `finished` — that flow lands in M5. `archiveFinishedGame` exists but stays unused in M3.

### 3.6 `Game.fromState` constructor

`server/game.ts` modification: add a static factory `Game.fromState(state: GameState): Game` that reconstructs a Game from a saved snapshot. The bag is rebuilt from `state.bag` (tile order preserved) using a new RNG seeded from `Date.now()` — bag *order* is restored from the saved tile array, not regenerated, so deterministic replay is preserved across restart even though the RNG seed for any *future* draws is new. (Future draws after reload will not be reproducible across restarts; that's acceptable — we don't need replay across crashes.)

This requires a tiny tweak to `bag.ts` to expose `Bag` construction from an existing tile array + RNG, e.g. `bagFromTiles(tiles, rng)`. The current `createBag(rng)` builds the standard 104-tile bag from scratch.

## 4. Client Architecture

### 4.1 Identity from URL

`client/src/App.tsx` on mount:

- `const params = new URLSearchParams(window.location.search)`
- `const slot = params.get('slot')` (must be `'0' | '1' | '2'`)
- `const name = params.get('name')?.trim()` (must be non-empty)
- If invalid: render a `<MissingParams>` page that explains the URL format with three example links (`?slot=0&name=Player1`, etc.). Do not open WS.
- Else: store in Zustand (`mySlot`, `myName`); open `/ws?slot=${slot}&name=${encodeURIComponent(name)}`.

### 4.2 Store (Zustand) additions

```ts
type StoreState = {
  // M2
  state: GameState | null;
  connected: boolean;
  // M3
  mySlot: Slot | null;
  myName: string | null;
  pendingPlacements: PendingPlacement[];
  lastError: string | null;
};

type PendingPlacement = {
  tileId: string;
  row: number;
  col: number;
};
```

`pendingPlacements` is purely client-side; the server never sees it until Submit. `playedAs` is derived at submit time from the rack tile's `letter` (M3 doesn't allow substitutions or blanks, so `playedAs === tile.letter`).

### 4.3 Drag-and-drop with `@dnd-kit/core`

- `<DndContext>` wraps `<App>`. `onDragEnd` dispatches to the store.
- `<Tile>` rack instances become `useDraggable` sources. Disabled when:
  - Not my turn (`state.turnIndex !== mySlot`)
  - Tile is a blank (`tile.isBlank`) — M3 doesn't support blanks
  - Tile is already in `pendingPlacements`
- Empty `<Square>` instances become `useDroppable` targets. A square is *empty* if `state.board[r][c] === null` **and** no `pendingPlacements` entry references `(r, c)`.
- On valid drop: append `{ tileId, row, col }` to `pendingPlacements`.
- Dragging a *pending* tile (rendered on the board) back to the rack, or clicking it, removes it from `pendingPlacements`. M3 keeps it simple: click-to-recall a single tile; "Recall All" button clears the array.

### 4.4 Rendering pending placements

`<Board>` decides each cell's contents in this order:

1. If `state.board[r][c]` is not null → render the committed tile.
2. Else if a `pendingPlacements` entry matches `(r,c)` → render the rack tile referenced by `tileId` with a "ghost" treatment (orange ring + reduced opacity).
3. Else → render the premium-square background.

`<Rack>` filters out tiles whose `id` is currently in `pendingPlacements` (or renders them at 30% opacity — pick one when implementing; both are fine).

### 4.5 Submit / Recall buttons

Live in the in-turn player's `<PlayerCard>`. Visible only when:

- `state.turnIndex === mySlot`
- `pendingPlacements.length > 0`

**Submit:** sends

```json
{
  "type": "submitMove",
  "placements": [
    { "tileId": "t-042", "row": 7, "col": 7, "playedAs": "К" },
    ...
  ]
}
```

with `playedAs` taken from the rack tile's `letter`.

**Recall All:** clears `pendingPlacements`.

### 4.6 Server response handling

- `state` (existing in M2): replace `state` in store. Also: if any `pendingPlacements` references a tile id no longer in my rack, drop it (defensive; happens after `moveAccepted`).
- `moveAccepted`: clear `pendingPlacements`, clear `lastError`. (We don't display the `moveRecord` in M3 beyond what the new `state` snapshot already shows — history panel is M5.)
- `moveRejected`: set `lastError` to `reason`. Do **not** clear `pendingPlacements` — user can adjust and resubmit.
- `error`: set `lastError` to `message`.

### 4.7 Error display

A small inline banner under the board, only visible when `lastError !== null`. Auto-clears when `pendingPlacements` changes (any drag, drop, or recall). Manual close button optional.

## 5. Data Flow (happy path)

```
T1 (slot 0): drags rack tile T to (7,7)
  store.pendingPlacements = [{T, 7, 7}]
  Board: ghost tile at (7,7); Rack: T hidden
T1 clicks Submit
  ws.send {type:'submitMove', placements:[{tileId:T, row:7, col:7, playedAs:'К'}]}
Server (slot 0 socket):
  Game.submitMove(0, [...]) → ok
  saveGame()
  broadcast state → all 3 sockets
  send moveAccepted → slot 0 only
T1, T2, T3 stores: receive state → board now has T committed at (7,7), turnIndex=1, scores updated, racks updated
T1 store: receive moveAccepted → pendingPlacements=[], lastError=null
T1 UI: ghost gone (already was — same cell now committed), Submit/Recall hidden (not my turn)
T2 UI: now my turn, drag enabled
```

## 6. File Layout

| File | Status | Responsibility |
|---|---|---|
| `server/connections.ts` | Create | Per-slot seat tracking (ws + name), seating logic, broadcast helper. |
| `server/persistence.ts` | Modify | Make `saveActiveGame` atomic (tmp + rename). Otherwise unchanged. |
| `server/game.ts` | Modify | Add `Game.fromState(state)` static factory. |
| `server/bag.ts` | Modify | Add `bagFromTiles(tiles, rng)` helper for reload. |
| `server/index.ts` | Modify | Remove auto-script. Add boot-load. Wire connection seating. Dispatch `submitMove`; stub the rest. |
| `server/scripted-game.ts` | Keep | Used only by `npm run demo`. |
| `shared/types.ts` | Modify | Add WS message type unions (`ClientMessage`, `ServerMessage`) for type-safe client + server dispatch. |
| `client/src/App.tsx` | Modify | Read URL params; render `<MissingParams>` or main UI; wrap in `<DndContext>`. |
| `client/src/MissingParams.tsx` | Create | Tiny helper page with example URLs. |
| `client/src/store.ts` | Modify | Add `mySlot`, `myName`, `pendingPlacements`, `lastError`, related actions. |
| `client/src/ws.ts` | Modify | Read identity from store; open `/ws?slot=&name=`; handle `moveAccepted`, `moveRejected`, `error`. |
| `client/src/components/Tile.tsx` | Modify | Make draggable when in rack and eligible. |
| `client/src/components/Square.tsx` | Modify | Make droppable when empty and it's my turn. Render ghost tile from pending. |
| `client/src/components/Rack.tsx` | Modify | Hide / fade tiles in `pendingPlacements`. |
| `client/src/components/PlayerCard.tsx` | Modify | Show Submit / Recall All when in-turn and pending non-empty. |
| `client/src/components/Board.tsx` | Modify | Pass row/col to `<Square>` so it can decide drop eligibility. |
| `client/src/components/ErrorBanner.tsx` | Create | Inline banner showing `lastError`. |
| `tests/integration/m3-server.test.ts` | Create | End-to-end seating + submitMove + reject + reconnect tests. |
| `package.json` | Modify | Add `@dnd-kit/core` dependency. |
| `CLAUDE.md` | Modify | Note URL-param identity (M3 stub for §10). |

## 7. Testing

### 7.1 Server integration test (`tests/integration/m3-server.test.ts`)

Boot the server in-process on an ephemeral port with a deterministic seed. Then:

1. Connect 3 fake WS clients with `?slot=0&name=A`, `?slot=1&name=B`, `?slot=2&name=C`. Assert each receives a `state` snapshot. Assert the third connection triggers `phase: 'playing'` and racks are dealt.
2. Send `submitMove` from slot 0 with a valid first-move placement crossing the center. Assert sender gets `moveAccepted`, all three receive a new `state` with the placed tile, advanced `turnIndex`, updated score.
3. Send `submitMove` from slot 0 again (out of turn). Assert `moveRejected` with reason `"Not your turn"`.
4. Send `submitMove` from slot 1 with an off-grid placement. Assert `moveRejected`.
5. Disconnect slot 1. Assert the other two receive a `state` with `players[1].connected === false`. Reconnect with `?slot=1&name=B` — assert success and a fresh `state`. Reconnect with `?slot=1&name=Other` — assert `error: "Slot taken"` and the socket closes.

The test uses the existing M2 in-process boot pattern.

### 7.2 No client automated tests

Per game-spec §11.3, manual UI testing only. Smoke after wiring: open three Chrome tabs, play a few moves, confirm scoring and turn progression.

## 8. Engineering Notes

- **YAGNI:** No "M3 mode" flag on the server. The engine is already fully correct; M3 just doesn't surface every action in the UI. M4 will simply add UI; the server doesn't change shape.
- **No `claimBlank` shortcut:** even though the engine supports it, M3 client never sends it (blanks aren't draggable). If a future bug let one through, the engine would happily accept it — that's fine; it's not a hard rule we want to break.
- **Determinism:** test boot uses a fixed seed. Production boot uses `Date.now()` only when creating a new game; reload from `data/game.json` is fully deterministic.
- **Atomic save:** write to `data/game.json.tmp`, then `fs.rename`. On Linux/macOS rename is atomic within the same filesystem.
- **Spec drift guard:** the slot-picker / `localStorage` flow described in game-spec §10 is intentionally **not** implemented in M3. M4 plan must implement §10 in full.
