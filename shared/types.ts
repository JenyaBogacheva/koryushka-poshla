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

export type GamePhase = 'waiting' | 'playing' | 'paused' | 'finished';

export type GameState = {
  phase: GamePhase;
  players: [Player, Player, Player];
  turnIndex: Slot;
  board: Board;
  bag: Tile[];
  centerBonusUsed: boolean;
  history: MoveRecord[];
  pausedReason?: { disconnectedSlot: Slot; pausedAt: number };
  recentGames: GameSummary[];
};

export type GameSummary = {
  id: string;
  startedAt: number;
  finishedAt: number;
  players: { slot: Slot; name: string; finalScore: number }[];
  winnerSlot: Slot | null;
};
