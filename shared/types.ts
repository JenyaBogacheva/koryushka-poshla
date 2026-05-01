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
  fromSlot: Slot;
  toSlot: Slot;
  points: 5;
  forMoveIndex: number;
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
  reason: 'allVowels' | 'allConsonants';
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

export type RevertRecord = {
  kind: 'revert';
  slot: Slot;
  revertedKind: GameEventKind;
  timestamp: number;
};

export type DrawState = {
  round: number;            // 1 = initial three-way; 2+ = tiebreak rounds
  candidates: Slot[];       // slots still in contention this round (subset of [0,1,2])
  draws: { slot: Slot; letter: Letter | null }[]; // already-revealed draws this round (null = blank)
};

export type DrawForOrderRecord = {
  kind: 'drawForOrder';
  draws: { slot: Slot; letter: Letter | null }[]; // null = blank; one entry per player in slot order
  firstSlot: Slot;
  timestamp: number;
};

export type GameEvent =
  | MoveRecord
  | AssistRecord
  | PassRecord
  | RedrawRecord
  | ClaimBlankRecord
  | EndGameRecord
  | RevertRecord
  | DrawForOrderRecord;

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

export type GameState = {
  phase: GamePhase;
  players: [Player, Player, Player];
  turnIndex: Slot;
  board: Board;
  bag: Tile[];
  centerBonusUsed: boolean;
  events: GameEvent[];
  startedAt: number | null;
  drawState: DrawState | null;
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

// --- WebSocket protocol (M4a: join+lobby added; non-placement actions stubbed in server; M4b will implement them) ---

export type ClientMessage =
  | { type: 'join'; slot: Slot; name: string; password: string }
  | { type: 'submitMove'; placements: Placement[]; helperSlot?: Slot }
  | { type: 'claimBlank'; row: number; col: number; myTileId: string }
  | { type: 'pass' }
  | { type: 'redraw' }
  | { type: 'toggleRackVisible'; visible: boolean }
  | { type: 'endGame' }
  | { type: 'revertLastTurn' }
  | { type: 'newGame' }
  | { type: 'drawTile' };

export type ServerMessage =
  | { type: 'lobby'; slots: [LobbySlot, LobbySlot, LobbySlot] }
  | { type: 'state'; state: GameState }
  | { type: 'moveAccepted'; moveRecord: MoveRecord; dictionaryWarnings: string[] }
  | { type: 'moveRejected'; reason: string }
  | { type: 'error'; message: string };
