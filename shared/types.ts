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
  slot: Slot;
  placements: Placement[];
  wordsFormed: WordFormed[];
  totalScore: number;
  bingoBonus: boolean;
  timestamp: number;
};

export type Player = {
  slot: Slot;
  name: string;
  connected: boolean;
  rack: Tile[];
  rackVisible: boolean;
  score: number;
};

export type GamePhase = 'waiting' | 'playing' | 'finished';

export type GameState = {
  phase: GamePhase;
  players: [Player, Player, Player];
  turnIndex: Slot;
  board: Board;
  bag: Tile[];
  centerBonusUsed: boolean;
  history: MoveRecord[];
  startedAt: number | null;
};

export type GameSummary = {
  id: string;
  startedAt: number;
  finishedAt: number;
  players: { slot: Slot; name: string; finalScore: number }[];
  winnerSlot: Slot | null;
};

export type LobbySlot = { slot: Slot; name: string; connected: boolean };

// --- WebSocket protocol (M4a: join+lobby added; non-placement actions stubbed in server; M4b will implement them) ---

export type ClientMessage =
  | { type: 'join'; slot: Slot; name: string; password: string }
  | { type: 'submitMove'; placements: Placement[] }
  | { type: 'claimBlank'; row: number; col: number; myTileId: string }
  | { type: 'pass' }
  | { type: 'redraw' }
  | { type: 'toggleRackVisible'; visible: boolean }
  | { type: 'endGame' };

export type ServerMessage =
  | { type: 'lobby'; slots: [LobbySlot, LobbySlot, LobbySlot] }
  | { type: 'state'; state: GameState }
  | { type: 'moveAccepted'; moveRecord: MoveRecord; dictionaryWarnings: string[] }
  | { type: 'moveRejected'; reason: string }
  | { type: 'error'; message: string };
