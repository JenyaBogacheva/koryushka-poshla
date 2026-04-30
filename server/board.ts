import type { Board, Cell, Placement, Tile, WordFormed } from '@shared/types';

export const SIZE = 15;

export function createEmptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array<Cell | null>(SIZE).fill(null));
}

export function isEmpty(board: Board): boolean {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r]![c] !== null) return false;
  return true;
}

function inRange(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

/**
 * Mutates the board: places each placement's tile (looked up from `tiles` by id) onto the cell.
 * Throws if a coord is out-of-range, the cell is occupied, or the tile id is unknown.
 */
export function applyPlacements(board: Board, placements: Placement[], tiles: Tile[]): void {
  const tilesById = new Map(tiles.map((t) => [t.id, t]));
  for (const p of placements) {
    if (!inRange(p.row, p.col)) {
      throw new Error(`Placement out of range: (${p.row}, ${p.col})`);
    }
    if (board[p.row]![p.col] !== null) {
      throw new Error(`Cell (${p.row}, ${p.col}) is already occupied`);
    }
    const tile = tilesById.get(p.tileId);
    if (!tile) throw new Error(`Tile ${p.tileId} not found`);
    board[p.row]![p.col] = {
      tile,
      playedAs: p.playedAs,
      fromBlank: tile.isBlank,
    };
  }
}

type Axis = 'H' | 'V';
const DIR: Record<Axis, { dr: number; dc: number }> = {
  H: { dr: 0, dc: 1 },
  V: { dr: 1, dc: 0 },
};

function runThrough(board: Board, row: number, col: number, axis: Axis) {
  const { dr, dc } = DIR[axis];
  // walk back to start
  let r = row, c = col;
  while (inRange(r - dr, c - dc) && board[r - dr]![c - dc] !== null) {
    r -= dr; c -= dc;
  }
  // walk forward, collecting cells
  const cells: { row: number; col: number; cell: Cell }[] = [];
  while (inRange(r, c) && board[r]![c] !== null) {
    cells.push({ row: r, col: c, cell: board[r]![c]! });
    r += dr; c += dc;
  }
  return cells;
}

function cellKey(row: number, col: number) { return `${row},${col}`; }

export function extractWordsFormed(board: Board, newPlacements: Placement[]): WordFormed[] {
  const newSet = new Set(newPlacements.map((p) => cellKey(p.row, p.col)));
  const seenRuns = new Set<string>();
  const result: WordFormed[] = [];

  for (const p of newPlacements) {
    for (const axis of ['H', 'V'] as const) {
      const run = runThrough(board, p.row, p.col, axis);
      if (run.length < 2) continue;
      // dedupe: identify run by start cell + axis
      const startKey = `${axis}:${run[0]!.row},${run[0]!.col}:${run.length}`;
      if (seenRuns.has(startKey)) continue;
      seenRuns.add(startKey);
      // require at least one new placement in the run
      const hasNew = run.some((x) => newSet.has(cellKey(x.row, x.col)));
      if (!hasNew) continue;
      result.push({
        word: run.map((x) => x.cell.playedAs).join(''),
        cells: run.map((x) => ({ row: x.row, col: x.col })),
        score: 0, // computed in scoring.ts
      });
    }
  }
  return result;
}
