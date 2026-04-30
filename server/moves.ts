import type { Board, Placement, Tile } from '@shared/types';
import { isSubstitutionAllowed } from './letters.js';

export const SIZE = 15;

export type MoveError =
  | { kind: 'no-placements' }
  | { kind: 'out-of-range'; row: number; col: number }
  | { kind: 'duplicate-target'; row: number; col: number }
  | { kind: 'cell-occupied'; row: number; col: number }
  | { kind: 'tile-not-in-rack'; tileId: string }
  | { kind: 'illegal-substitution'; tileLetter: string; playedAs: string }
  | { kind: 'first-move-must-cover-center' }
  | { kind: 'group-not-connected'; row: number; col: number };

export type MoveValidation = { ok: true } | { ok: false; error: MoveError };

function inRange(row: number, col: number): boolean {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

const CENTER_ROW = 7, CENTER_COL = 7;

export function validateMove(
  board: Board,
  rack: Tile[],
  placements: Placement[],
  isFirstMove: boolean,
): MoveValidation {
  if (placements.length === 0) return { ok: false, error: { kind: 'no-placements' } };

  const rackById = new Map(rack.map((t) => [t.id, t]));
  const targets = new Set<string>();

  for (const p of placements) {
    if (!inRange(p.row, p.col)) {
      return { ok: false, error: { kind: 'out-of-range', row: p.row, col: p.col } };
    }
    const key = `${p.row},${p.col}`;
    if (targets.has(key)) {
      return { ok: false, error: { kind: 'duplicate-target', row: p.row, col: p.col } };
    }
    targets.add(key);
    if (board[p.row]![p.col] !== null) {
      return { ok: false, error: { kind: 'cell-occupied', row: p.row, col: p.col } };
    }
    const tile = rackById.get(p.tileId);
    if (!tile) return { ok: false, error: { kind: 'tile-not-in-rack', tileId: p.tileId } };
    // Blanks may be played as any single Cyrillic letter.
    if (!tile.isBlank && !isSubstitutionAllowed(tile.letter, p.playedAs)) {
      return { ok: false, error: { kind: 'illegal-substitution', tileLetter: tile.letter, playedAs: p.playedAs } };
    }
  }

  // Connectivity / first-move rules.
  if (isFirstMove) {
    if (!targets.has(`${CENTER_ROW},${CENTER_COL}`)) {
      return { ok: false, error: { kind: 'first-move-must-cover-center' } };
    }
    return { ok: true };
  }

  // For non-first moves: every connected group of *new* placements must touch at least one existing board tile.
  const newCoords = placements.map((p) => ({ row: p.row, col: p.col }));
  const visited = new Set<string>();
  const groups: { row: number; col: number }[][] = [];
  for (const start of newCoords) {
    const sk = `${start.row},${start.col}`;
    if (visited.has(sk)) continue;
    const group: { row: number; col: number }[] = [];
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop()!;
      const ck = `${cur.row},${cur.col}`;
      if (visited.has(ck)) continue;
      visited.add(ck);
      group.push(cur);
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nk = `${cur.row + dr},${cur.col + dc}`;
        if (targets.has(nk) && !visited.has(nk)) {
          stack.push({ row: cur.row + dr, col: cur.col + dc });
        }
      }
    }
    groups.push(group);
  }

  for (const group of groups) {
    const touchesExisting = group.some(({ row, col }) =>
      [[-1,0],[1,0],[0,-1],[0,1]].some(([dr, dc]) => {
        const r = row + dr!, c = col + dc!;
        return inRange(r, c) && board[r]![c] !== null;
      }),
    );
    if (!touchesExisting) {
      return { ok: false, error: { kind: 'group-not-connected', row: group[0]!.row, col: group[0]!.col } };
    }
  }

  return { ok: true };
}
