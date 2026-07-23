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
| **Tile distribution** | Russian Эрудит set — 105 tiles, Ё separate from Е, Ъ separate from Ь, 3 blanks ("звёздочки"). |
| **Tile values** | Standard Russian point values per letter. |
| **Bingo bonus** | **+10** for using all 7 rack tiles in one turn (not the standard +50). Counts when 7 tiles are placed across multiple disconnected groups. |
| **Multi-spot placement** | A single turn may place tiles in **multiple disconnected groups** on the board. Each group must (a) form valid words individually and as cross-words, and (b) connect to existing tiles. *Exception:* the very first move of the game is one group and must cross the center star. |
| **Word form** | Only Russian nouns in **nominative singular** ("кошка" yes, "кошку" no). |
| **Dictionary check** | **Advisory only.** The server flags unknown words via warnings; never blocks or penalizes. Players decide. |
| **Letter substitutions (bidirectional)** | A tile may be played as its partner letter in any of the four pairs Ё↔Е, Ъ↔Ь, Щ↔Ш, Й↔И. Scoring uses the played-as letter's point value (so Е played as Ё scores 3, Ё played as Е scores 1). |
| **Bonus squares (DW/TW/DL/TL)** | **Reusable** — apply every turn a tile sits on them, not only when first covered. **Exception:** the center DW only applies the first time it is covered. |
| **Word scoring** | Standard — every word formed by your move (the main word plus any perpendicular side words containing a new tile) is scored. |
| **Rack visibility** | Each player can show or hide their rack to opponents. **Default: visible.** Toggleable any time. |
| **All-vowel / all-consonant rack** | Free redraw — return all 7 tiles, draw 7 fresh ones, **does not consume the turn**. The signs **Ъ/Ь** carry no sound and can't stand alone, so they count as **both** vowel and consonant: a rack of vowels-plus-signs still qualifies as all-vowel, consonants-plus-signs as all-consonant, and a rack of only signs qualifies. A blank tile never qualifies (it makes the rack playable). |
| **Revert last turn** | The player who just submitted an action (place / pass / redraw / claimBlank) may revert it, restoring the pre-action state. The window closes the moment any other player submits any action. One level of undo only; not persisted across server restarts. |
| **Blank-swap ("claim blank")** | When a blank tile is on the board representing letter X, any player who has a real X tile in their rack may, on their own turn (before submitting a move), claim the blank: the real X takes the cell, the blank moves to the player's rack. **First-come-first-served** — first valid claim wins. |
| **Helping hand (+5)** | Each player's card shows a **fish + name** button for each of the **other two** players, available throughout play and not tied to any turn. Pressing it awards that player **+5** immediately ("помог +5"). No move required, no cap, no attribution to a specific move, no undo — family honor system. Each award is logged as an `assist` event; the "helper" end-game badge goes to whoever received the most awards. |
| **Word suggestions (подсказки)** | While it is **not** your turn you may privately queue suggested words — type a word, press Enter, repeat as many as you like. They stay hidden from everyone, including the active player, who sees only a **count** ("💡 N"). When the active player presses **"Прошу помощь"**, all queued words are revealed to **everyone at once**, shown on each suggester's card. Reveal is **once per turn**; words added after the reveal wait for the next turn. Suggestions are **per-turn** state on `GameState.help` — cleared whenever the turn advances (move / pass / swap) and **not** logged as events or written to game history. Awarding **+5** for a useful hint stays manual via the Helping hand button — no auto-attribution. |
| **Cool-word swap** | On your turn (before submitting), you may offer to trade one of your rack tiles for a specific tile from one opponent whose rack is visible, declaring a "cool word" of ≥ 7 letters. The word is self-declared and never verified. If the opponent accepts, the tiles trade, you get **−5** and they get **+5**, and a `swap` event is logged. Declining clears the offer. The swap does not consume your turn. See `2026-06-01-cool-word-swap-design.md`. |
| **Challenges** | None — there is no challenge mechanic. The dictionary advisory replaces it. |
| **Time limits** | None. |
| **Game end** | No automatic end. Any player can end the game at any time via an "End game" button (single confirmation modal to avoid accidents). Scores are taken as-is — no remaining-tile-point adjustment. Highest score wins; ties are ties. |

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
│       ├── tiles-ru.json           # 105-tile Russian distribution + point values
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
│   │   ├── ActionBar.tsx           # Submit / Swap / Pass / Redraw / Toggle visibility / End game
│   │   ├── BlankPicker.tsx         # Dialog when placing a blank
│   │   ├── SubstitutionPicker.tsx  # Dialog when placing any letter in a substitution pair (Ё↔Е, Ъ↔Ь, Щ↔Ш, Й↔И): pick itself or partner
│   │   ├── SwapDialog.tsx          # Offer dialog: pick opponent + two tiles + cool word
│   │   ├── SwapBanner.tsx          # Pending-swap banner: accept / decline / cancel
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
  redrawEligible: boolean;           // server-stamped: rack is all-vowel or all-consonant
  canRevert: boolean;                // server-stamped: this player just acted, no one else has acted since
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
| `claimBlank` | `{ row, col, myTileId }` | Swap a real letter onto the board for an existing blank. |
| `revertLastTurn` | `{}` | Single-step undo for the action's author; valid until any other player acts. |
| `pass` | `{}` | Skip turn. |
| `redraw` | `{}` | Free redraw when rack is all-vowel or all-consonant; does not end turn. |
| `toggleRackVisible` | `{ visible: boolean }` | Show/hide own rack. |
| `endGame` | `{}` | End the game now (after client-side confirmation). Phase → `finished`; game archived to history. |
| `drawTile` | `{}` | During `phase: 'drawing'`, reveal one tile for the sender's slot in the current жребий round. |

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

Each `Placement` carries `playedAs`. When `tile.letter !== playedAs`, the server validates the pair is one of the four allowed bidirectional substitutions (Ё↔Е, Ъ↔Ь, Щ↔Ш, Й↔И). The cell stores both the physical `tile` and `playedAs`. Scoring uses `playedAs.points`, not `tile.points`. The board UI displays `playedAs`.

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

The signs **Ъ** and **Ь** count as both vowel and consonant for this check, since a rack of vowels (or consonants) plus a sign is just as unplayable as the pure case. Blanks disqualify the rack — a blank can stand in for any letter, so the rack is playable.

### 9.6 Жребий (draw-for-order)

When all three players are seated, the game enters `phase: 'drawing'`. Each player clicks their own face-down tile (client message `drawTile`); the server reveals that slot's letter and returns the tile to the bag. After all candidates have drawn, **the full turn order is decided by the draw** (`compareLetterOrder`): the player whose letter is earliest in the Russian alphabet plays first, next-earliest second, latest third. On a tie at any rank, only the tied players draw again in a subsequent round (`drawState.round` increments, `candidates` shrinks to just the tied set, while `rankedTop`/`rankedBottom` hold the ranks already settled above and below them); this repeats until every rank is unique. Racks are dealt and `phase` becomes `'playing'` only after resolution. The resulting order is stored as `GameState.turnOrder` (a permutation of `[0,1,2]`) and drives turn rotation for the **whole game** — `turnIndex` advances through `turnOrder`, not seat order. The persisted `DrawForOrderRecord` event captures the **initial** three-way draw and the eventual full `order`; tiebreak rounds are not retained in the event log. The transient `drawState: DrawState | null` on `GameState` is what the UI renders during the ritual; it is `null` outside the drawing phase, persisted across server restarts so a mid-draw reload resumes correctly.

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
4. **M4 — All the rules.** Slot picker UI + name input + reconnect-by-name (§10), multi-spot placement, substitution picker, blank picker, blank-swap, swap-tiles, pass, all-vowel/all-consonant redraw, end-game button, rack visibility toggle, dictionary advisory display. (M3 stubs the join flow with `?slot=N&name=X` URL params and replies `not yet implemented` to non-`submitMove` actions; M4 fills both in.)
5. **M5 — Polish.** Split into two slices:
   - **M5a** (see `docs/superpowers/specs/2026-05-01-m5a-snapshots-assist-log-design.md`): live move log, finished-game snapshots + Past Games viewer, "мама помогла" assist credit.
   - **M5b**: disconnect/pause overlay, dictionary advisory warnings, animations, "Новая игра" / play-again flow on the finished-game screen, deploy to Render.
6. **M6 — Gamification.** Split into two slices:
   - **M6a** (see `docs/superpowers/specs/2026-05-02-m6a-gamification-design.md`): per-game badges (бинго, длинное слово, крупный ход, помощник, золото/серебро/бронза) + game-end celebration overlay.
   - **M6b** (deferred): cross-game leaderboard + cumulative achievements aggregated from archived snapshots.

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
