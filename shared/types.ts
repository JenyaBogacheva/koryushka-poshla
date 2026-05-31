// Russian alphabet letter (one Cyrillic codepoint).
export type Letter = string; // single Cyrillic uppercase character

export type Slot = 0 | 1 | 2;

export type Tile = {
  id: string;          // unique within a game (e.g., "t-042")
  letter: Letter;      // physical letter on the tile; '' for blanks
  points: number;      // tile's printed point value (0 for blanks)
  isBlank: boolean;
};

export type Cell = {
  tile: Tile;          // physical tile on this cell
  playedAs: Letter;    // letter this cell represents on the board (for blanks/substitutions)
  fromBlank: boolean;  // true if `tile.isBlank` was true at placement; affects blank-swap eligibility
};

export type Board = (Cell | null)[][]; // 15 rows × 15 cols

export type Premium = 'TW' | 'DW' | 'TL' | 'DL' | 'CENTER' | null;
export type PremiumMap = Premium[][]; // 15×15

export type Placement = {
  tileId: string;
  row: number;
  col: number;
  playedAs: Letter;
};

export type WordFormed = {
  word: string;
  cells: { row: number; col: number }[]; // in reading order
  score: number;
};

export type MoveRecord = {
  kind: 'move';
  slot: Slot;
  placements: Placement[];
  wordsFormed: WordFormed[];
  totalScore: number;
  bingoBonus: boolean;
  helperSlot: Slot | null;
  dictionaryWarnings: string[];
  timestamp: number;
};

export type AssistRecord = {
  kind: 'assist';
  helperSlot: Slot; // player awarded +5 for helping
  points: 5;
  timestamp: number;
};

export type PassRecord = {
  kind: 'pass';
  slot: Slot;
  timestamp: number;
};

export type RedrawRecord = {
  kind: 'redraw';
  slot: Slot;
  reason: 'allVowels' | 'allConsonants' | 'swapAll';
  tileCount: number;
  timestamp: number;
};

export type ClaimBlankRecord = {
  kind: 'claimBlank';
  slot: Slot;
  row: number;
  col: number;
  letterAs: Letter;
  timestamp: number;
};

export type EndGameRecord = {
  kind: 'endGame';
  slot: Slot;
  cause: 'playerEnded' | 'bagEmptyAndRackEmpty' | 'sixPasses';
  timestamp: number;
};

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

export type DrawState = {
  round: number;            // 1 = initial three-way; 2+ = tiebreak rounds
  candidates: Slot[];       // slots being ordered among themselves this round (subset of [0,1,2])
  draws: { slot: Slot; letter: Letter | null }[]; // already-revealed draws this round (null = blank)
  rankedTop: Slot[];        // slots whose ranks are already fixed, best rank first (precede the candidates)
  rankedBottom: Slot[];     // slots whose ranks are already fixed, best rank first (follow the candidates)
};

export type DrawForOrderRecord = {
  kind: 'drawForOrder';
  draws: { slot: Slot; letter: Letter | null }[]; // initial three-way draw; null = blank
  order: [Slot, Slot, Slot]; // full turn order (rank 1 → 3) decided by the draw, ties broken by redraw
  timestamp: number;
};

export type GameEvent =
  | MoveRecord
  | AssistRecord
  | PassRecord
  | RedrawRecord
  | ClaimBlankRecord
  | EndGameRecord
  | DrawForOrderRecord
  | SwapRecord;

export type GameEventKind = GameEvent['kind'];

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

export type GamePhase = 'waiting' | 'drawing' | 'playing' | 'finished';

export type HelpSuggestion = { slot: Slot; word: string };

// Per-turn word hints: non-active players queue words privately; nothing is shown
// (the active player sees only a count) until they press "Прошу помощь" to reveal
// all of them to everyone at once. Reset whenever the turn advances; never logged.
export type HelpState = {
  revealed: boolean;
  suggestions: HelpSuggestion[];
};

export type GameState = {
  phase: GamePhase;
  players: [Player, Player, Player];
  turnIndex: Slot;
  turnOrder: [Slot, Slot, Slot]; // play order for the whole game, decided by the жребий draw
  board: Board;
  bag: Tile[];
  centerBonusUsed: boolean;
  events: GameEvent[];
  startedAt: number | null;
  drawState: DrawState | null;
  pendingSwap: SwapOffer | null;
  help: HelpState;
};

export type GameSummary = {
  id: string;
  startedAt: number;
  finishedAt: number;
  players: { slot: Slot; name: string; finalScore: number }[];
  winnerSlot: Slot | null;
};

export type GameArchive = {
  id: string;
  startedAt: number;
  finishedAt: number;
  players: { slot: Slot; name: string; finalScore: number }[];
  winnerSlot: Slot | null;
  finalBoard: Board;
  events: GameEvent[];
};

export type LobbySlot = { slot: Slot; name: string; connected: boolean };

export type BadgeKind =
  | 'bingo'
  | 'longWord'
  | 'bigMove'
  | 'helper'
  | 'gold'
  | 'silver'
  | 'bronze';

// --- WebSocket protocol (M4a: join+lobby added; non-placement actions stubbed in server; M4b will implement them) ---

export type ClientMessage =
  | { type: 'join'; slot: Slot; name: string; password: string }
  | { type: 'submitMove'; placements: Placement[] }
  | { type: 'giveAssist'; toSlot: Slot }
  | { type: 'suggestWord'; word: string }
  | { type: 'requestHelp' }
  | { type: 'claimBlank'; row: number; col: number; myTileId: string }
  | { type: 'pass' }
  | { type: 'redraw' }
  | { type: 'swapAll' }
  | { type: 'offerSwap'; toSlot: Slot; giveTileId: string; takeTileId: string; word: string }
  | { type: 'respondSwap'; accept: boolean }
  | { type: 'cancelSwap' }
  | { type: 'toggleRackVisible'; visible: boolean }
  | { type: 'endGame' }
  | { type: 'revertLastTurn' }
  | { type: 'newGame' }
  | { type: 'drawTile' }
  | { type: 'previewMove'; placements: Placement[] };

export type MovePreview =
  | { ok: true; totalScore: number; bingoBonus: boolean; wordsFormed: WordFormed[]; dictionaryWarnings: string[] }
  | { ok: false; reason: string };

export type ServerMessage =
  | { type: 'lobby'; slots: [LobbySlot, LobbySlot, LobbySlot] }
  | { type: 'state'; state: GameState }
  | { type: 'moveAccepted'; moveRecord: MoveRecord; dictionaryWarnings: string[] }
  | { type: 'moveRejected'; reason: string }
  | { type: 'movePreview'; preview: MovePreview }
  | { type: 'error'; message: string };
