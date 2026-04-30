import type { Board, Cell, Placement, Tile } from '@shared/types';

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
