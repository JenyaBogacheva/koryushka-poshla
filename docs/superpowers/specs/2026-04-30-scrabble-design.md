# Russian Family Scrabble — Design Spec

**Date:** 2026-04-30
**Status:** Draft for review

## 1. Goal

A real-time, online, three-player Russian Scrabble game ("Эрудит") for a family playing together across cities. One URL, three fixed slots, no accounts. Built fresh rather than forked — the codebase has to stay small and hackable so house rules can be tweaked easily.

## 2. Players & Setting

- Exactly three players, each on their own laptop, in different cities.
- Modern desktop browsers (Chrome / Safari / Firefox, last few years).
- Real-time / synchronous play — everyone online at once for the duration of a game.
- Out-of-band coordination ("let's play tonight at 8") via text/phone; the app does not handle scheduling or notifications.
- Russian language only (Cyrillic tiles + Russian dictionary).

## 3. House Rules (deviations from standard Scrabble)

| Rule | Behavior |
|---|---|
| **Tile distribution** | Standard Russian Эрудит set — 104 tiles, Ё separate from Е, Ъ separate from Ь, 2 blanks ("звёздочки"). |
| **Tile values** | Standard Russian point values per letter. |
| **Bingo bonus** | **+10** for using all 7 rack tiles in one turn (not the standard +50). Counts when 7 tiles are placed across multiple disconnected groups. |
| **Multi-spot placement** | A single turn may place tiles in **multiple disconnected groups** on the board. Each group must (a) form valid words individually and as cross-words, and (b) connect to existing tiles. *Exception:* the very first move of the game is one group and must cross the center star. |
| **Word form** | Only Russian nouns in **nominative singular** ("кошка" yes, "кошку" no). |
| **Dictionary check** | **Advisory only.** The server flags unknown words via warnings; never blocks or penalizes. Players decide. |
| **Letter substitutions (one-way)** | A tile may be played as a "softer" letter, scoring at the substitute's point value: Ё→Е, Ъ→Ь, Ш→Щ, Й→И. Reverse direction not allowed. |
| **Bonus squares (DW/TW/DL/TL)** | **Reusable** — apply every turn a tile sits on them, not only when first covered. **Exception:** the center DW only applies the first time it is covered. |
| **Word scoring** | Standard — every word formed by your move (the main word plus any perpendicular side words containing a new tile) is scored. |
| **Rack visibility** | Each player can show or hide their rack to opponents. **Default: visible.** Toggleable any time. |
| **All-vowel / all-consonant rack** | Free redraw — return all 7 tiles, draw 7 fresh ones, **does not consume the turn**. |
| **Tile swap** | Standard swap (exchange tiles with the bag, ends turn) available. |
| **Blank-swap ("claim blank")** | When a blank tile is on the board representing letter X, any player who has a real X tile in their rack may, on their own turn (before submitting a move), claim the blank: the real X takes the cell, the blank moves to the player's rack. **First-come-first-served** — first valid claim wins. |
| **Challenges** | None — there is no challenge mechanic. The dictionary advisory replaces it. |
| **Time limits** | None. |
| **Game end** | Game ends when (a) the bag is empty *and* one player has emptied their rack, or (b) all three players pass consecutively (3 passes in a row, no other moves between). At end: each player's remaining-tile points are subtracted from their score; if ended via (a), the unused-tile point sum is added to the player who emptied their rack. Highest score wins. |

## 4. Architecture

**One Render service (free tier), Node + TypeScript.** A single deployment serves both the static React frontend and the WebSocket backend. No frontend/backend split — the game has tiny traffic, no CDN benefit, and consolidating eliminates CORS and version-mismatch concerns.

```
   Browser ──HTTP──▶  Render service ──▶  serves index.html + bundle.js
   Browser ──WS────▶  Render service ──▶  game logic, state, dictionary
```

**Server-authoritative.** All rules, state, scoring, and dictionary lookups live on the server. The client is a thin renderer:
- Connects via WebSocket on page load.
- Receives full game-state snapshots; renders board / racks / scores / panels.
- Sends user actions; never duplicates rule logic.

**Persistence.** Active game state is written to `data/game.json` after every accepted action. On server start, if that file exists, the game resumes from it. Finished games archive to `data/history/<id>.json` and `game.json` is cleared so a new game can begin. Render's free-tier disk is ephemeral on redeploy — acceptable, since games are short and the 5-minute pause window is the main resilience case.

**Identity.** No accounts, no passwords. Each laptop stores `{ slot, name }` in `localStorage` on first visit (slot picker + name entry). Subsequent visits auto-claim that slot. Server validates the slot is free (or held by a disconnected player matching the same name) and assigns it.

**Disconnect handling.** WebSocket close during a `playing` game pauses the entire game; all other clients see a "Waiting for {name}…" overlay. The disconnected player has 5 minutes to reconnect, after which the game stays paused indefinitely (saved to disk; resumable later by reopening the URL). Games never auto-forfeit.

## 5. Visual Design

- **Palette: soft warm modern.** Cream background (`#f5ebdd`), off-white tiles (`#fdf8f0`), muted bonus squares — sage (`#c9e4d8` / `#7eb8a0`), peach (`#f5d4b8`), terracotta (`#d97757`). Dark warm text (`#4a3528`).
- **Typography:** rounded sans-serif (Inter or system equivalent) supporting Cyrillic well.
- **Layout: player cards in right column.** Board on the left taking the spotlight; right column stacks three player cards (each shows name, score, rack — visible or hidden indicator). Current turn's card is highlighted with the peach background. Below the board: own tile rack (left) and action buttons (right) on a single row.
- **Tile aesthetic:** subtle drop shadow, rounded corners, point value in small text bottom-right of each tile.
- **Animations:** subtle tile-drop on placement; gentle score tick-up after a move. No sound effects by default.
- All visual choices are isolated in CSS variables / Tailwind config so they can be tweaked without touching component logic.

## 6. Components & File Layout

```
scrabble/
├── package.json
├── tsconfig.json
├── render.yaml                     # Render deployment config
├── server/
│   ├── index.ts                    # Express + ws bootstrap; serves built client + /ws
│   ├── game.ts                     # Game class — state, turn flow, phase transitions
│   ├── board.ts                    # 15×15 board, premium-square map, placement validation
│   ├── bag.ts                      # Tile bag (Russian distribution), draw/return, shuffle
│   ├── rack.ts                     # Per-player rack; all-vowel/consonant detection
│   ├── moves.ts                    # Move validation: connectivity, multi-spot, substitutions, blank-swap
│   ├── scoring.ts                  # Word scoring, bonus squares (reusable + center-once), +10 bingo
│   ├── dictionary.ts               # Loads noun list, advisory check
│   ├── persistence.ts              # JSON save/load for active game and history
│   ├── protocol.ts                 # Shared WS message types (server side)
│   └── data/
│       ├── tiles-ru.json           # 104-tile Russian distribution + point values
│       └── nouns-ru.txt            # Russian nominative-singular noun list (~100k entries, OpenCorpora-derived)
├── client/
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx                     # Top-level layout: board + rack + player cards
│   ├── components/
│   │   ├── Board.tsx               # 15×15 grid, drop targets
│   │   ├── Square.tsx              # Single board cell (bonus styling, placed tile, pending tile)
│   │   ├── Rack.tsx                # Own rack, draggable tiles
│   │   ├── PlayerCard.tsx          # Right-column card: name, score, rack (visible/hidden), turn highlight
│   │   ├── ActionBar.tsx           # Submit / Swap / Pass / Redraw / Toggle visibility
│   │   ├── BlankPicker.tsx         # Dialog when placing a blank
│   │   ├── SubstitutionPicker.tsx  # Dialog when placing Ё/Ъ/Ш/Й (pick: itself or substitute)
│   │   ├── HistoryPanel.tsx        # List of past games (date, scores, winner)
│   │   ├── SlotPicker.tsx          # First-visit slot + name entry
│   │   └── DisconnectOverlay.tsx   # "Waiting for {name}…" pause screen
│   ├── store.ts                    # Client state: latest server snapshot + local pending placement
│   ├── ws.ts                       # WebSocket client wrapper
│   └── styles/                     # CSS variables / Tailwind config for the palette
└── shared/
    └── types.ts                    # Game state types shared between client and server
```

## 7. Data Model

```ts
type GameState = {
  phase: 'waiting' | 'playing' | 'paused' | 'finished';
  players: [Player, Player, Player];
  turnIndex: 0 | 1 | 2;
  board: (Cell | null)[][];          // 15×15
  bag: Tile[];                       // remaining tiles, shuffled
  centerBonusUsed: boolean;          // center DW one-shot flag
  history: MoveRecord[];             // for resume + UI scrollback
  pausedReason?: { disconnectedSlot: 0 | 1 | 2; pausedAt: number };
  recentGames: GameSummary[];        // server-loaded summaries from data/history/
};

type Player = {
  slot: 0 | 1 | 2;
  name: string;
  connected: boolean;
  rack: Tile[];                      // up to 7
  rackVisible: boolean;              // default true
  score: number;
};

type Tile = { id: string; letter: Letter; points: number; isBlank: boolean };

type Cell = {
  tile: Tile;                        // physical tile placed
  playedAs: Letter;                  // letter it represents (for blanks/substitutions)
  fromBlank: boolean;                // for blank-swap eligibility
};

type Placement = { tileId: string; row: number; col: number; playedAs: Letter };

type MoveRecord = {
  slot: 0 | 1 | 2;
  placements: Placement[];
  wordsFormed: { word: string; score: number }[];
  totalScore: number;
  bingoBonus: boolean;
  timestamp: number;
};

type GameSummary = {
  id: string;
  startedAt: number;
  finishedAt: number;
  players: { slot: number; name: string; finalScore: number }[];
  winnerSlot: 0 | 1 | 2 | null;
};
```

## 8. WebSocket Protocol

All messages are JSON with a `type` field.

**Client → server:**

| Type | Payload | Meaning |
|---|---|---|
| `join` | `{ slot, name }` | Claim a slot on page load. |
| `submitMove` | `{ placements: Placement[] }` | Place tiles (one or more disconnected groups) and end turn. |
| `swapTiles` | `{ tileIds: string[] }` | Exchange tiles with the bag (ends turn). |
| `claimBlank` | `{ row, col, myTileId }` | Swap a real letter onto the board for an existing blank. |
| `pass` | `{}` | Skip turn. |
| `redraw` | `{}` | Free redraw when rack is all-vowel or all-consonant; does not end turn. |
| `toggleRackVisible` | `{ visible: boolean }` | Show/hide own rack. |

**Server → client:**

| Type | Payload | Meaning |
|---|---|---|
| `state` | full `GameState` (opponents' racks redacted to counts when hidden) | Snapshot, sent on join and after every change. |
| `moveAccepted` | `{ moveRecord, dictionaryWarnings: string[] }` | Move went through; flags any unknown words advisory-only. |
| `moveRejected` | `{ reason }` | Violates a hard rule (off-grid, disconnected from board, invalid word formation, etc.). |
| `error` | `{ message }` | Protocol-level error. |

**Snapshot model:** server pushes a fresh `state` after every accepted action. Snapshots are small (~few KB) and avoid client-side patching bugs.

**Redaction:** when `rackVisible: false`, opponents see `{ rackCount: N }` in place of the actual `rack`. Server enforces redaction; client cannot bypass.

## 9. Rule Implementation Details

### 9.1 Multi-spot placement

On `submitMove`:
1. Group placements into connected components on the (board ∪ new placements) grid.
2. Every group must contain at least one tile that connects to an existing board tile. *Exception:* the first move of the game — one group, must cover the center star.
3. For each group, extract the main word(s) and all perpendicular side words containing a new tile. Each word ≥ 2 letters, no gaps.
4. Sum scores across all groups (see §9.3).
5. If all 7 rack tiles were placed across all groups combined, add **+10 bingo**.
6. Run the dictionary check on every formed word; collect unknown words into `dictionaryWarnings` (advisory).

### 9.2 Letter substitutions

Each `Placement` carries `playedAs`. When `tile.letter !== playedAs`, the server validates the pair is one of the four allowed one-way substitutions (Ё→Е, Ъ→Ь, Ш→Щ, Й→И). The cell stores both the physical `tile` and `playedAs`. Scoring uses `playedAs.points`, not `tile.points`. The board UI displays `playedAs`.

### 9.3 Reusable bonus squares

For each tile in a formed word:
- Letter-score multiplier: DL → ×2, TL → ×3, applied to `playedAs.points`.

For each tile in a formed word:
- Word-score multiplier: DW → ×2 (skipped if cell is the center and `centerBonusUsed` is true); TW → ×3.

`word_total = (sum of letter scores) × (product of word multipliers)`

After a move completes, if a new tile occupies the center, set `centerBonusUsed = true` (idempotent).

### 9.4 Blank-swap

Sent as `claimBlank` (separate from `submitMove`). Allowed only on the sender's own turn, before they submit a move.
- Cell at `(row, col)` must hold a tile with `fromBlank: true`.
- Sender's rack must contain a real (non-blank) tile whose `letter` equals the cell's `playedAs`.
- Server processes claims in arrival order; first valid claim wins.
- On success: real tile takes the cell (preserving `playedAs`, clearing `fromBlank`); the blank moves to the sender's rack. Snapshot pushed.

### 9.5 All-vowel / all-consonant redraw

After every rack draw, the server checks the player's 7 tiles. If all vowels or all consonants, the `redraw` action becomes available to that player (advertised in their state snapshot). Using it returns all 7 tiles to the bag, reshuffles, draws 7 fresh ones, and does not consume the turn.

## 10. Identity & Session Flow

1. **First visit (any laptop):** page shows `<SlotPicker>` with the three slots (free or claimed). User picks a free slot, types a name, clicks Join. Browser stores `{ slot, name }` in `localStorage`.
2. **Subsequent visits:** if `localStorage` has a slot+name, the client auto-sends `join` on connect.
3. **Server:** for each `join`, accept if (a) the slot is free, or (b) the slot is held by a disconnected player whose stored name matches. Otherwise respond with `error: "Slot taken"` and the client clears `localStorage` and shows the slot picker again.
4. **Game starts** when all three slots are connected and `phase === 'waiting'` → `phase = 'playing'`, server deals racks.

## 11. Testing

Three layers, in priority order:

1. **Server unit tests (vitest)** — exhaustive cases for every house rule:
   - Multi-spot placement: connectivity, multiple disconnected groups, word extraction.
   - Substitutions: allowed pairs only; scoring uses substitute's points.
   - Reusable bonus squares: TW/DW fire repeatedly; center DW once.
   - +10 bingo: triggers across multi-group placements.
   - Blank-swap: ordering, only-own-turn, eligibility checks.
   - All-vowel/all-consonant redraw: detection + rack refresh + turn not consumed.
   - Word extraction: side words found correctly.

2. **Integration tests** — boot the server, connect 3 fake WS clients, play scripted end-to-end games. Catches protocol/snapshot/redaction bugs.

3. **Manual UI testing** — playing the game; no automated browser tests.

## 12. Milestones

1. **M1 — Bones.** Server with game state, board, bag, racks. No UI. Programmatic script runs a full game and prints scores. Get the rules right in isolation.
2. **M2 — Read-only client.** React app connects via WS and renders board / player cards / racks / scores. No interaction; server runs a scripted game and the client reflects it.
3. **M3 — Place-and-submit.** Drag tiles onto the board, submit, see score update. Single-spot placement, no substitutions, no blanks.
4. **M4 — All the rules.** Multi-spot placement, substitution picker, blank picker, blank-swap, swap-tiles, all-vowel redraw, rack visibility toggle.
5. **M5 — Polish.** Disconnect/pause overlay, history panel, dictionary advisory warnings, animations, deploy to Render.

Each milestone is end-to-end playable or testable before moving on.

## 13. Out of Scope (YAGNI)

- AI / computer player.
- Spectator mode or >3 players.
- Mobile / tablet UI (laptops only).
- Accounts, login, passwords.
- In-app chat (out-of-band coordination assumed).
- Game replay (history shows summary list only).
- Languages other than Russian.
- Challenge mechanic.
- Time limits per turn.
- Auto-forfeit on prolonged disconnect (game just stays paused).
