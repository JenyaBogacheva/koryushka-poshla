import { describe, it, expect } from 'vitest';
import { createEmptyBoard, applyPlacements, isEmpty } from '../server/board';
import type { Placement, Tile } from '@shared/types';

const tile = (id: string, letter: string, points: number, isBlank = false): Tile => ({
  id, letter, points, isBlank,
});

describe('board', () => {
  it('is 15x15 of nulls', () => {
    const b = createEmptyBoard();
    expect(b.length).toBe(15);
    for (const row of b) {
      expect(row.length).toBe(15);
      for (const cell of row) expect(cell).toBeNull();
    }
  });

  it('reports emptiness', () => {
    const b = createEmptyBoard();
    expect(isEmpty(b)).toBe(true);
  });

  it('applies placements with their tiles', () => {
    const b = createEmptyBoard();
    const tiles = [tile('a', 'К', 2), tile('b', 'О', 1), tile('c', 'Т', 1)];
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 7, playedAs: 'К' },
      { tileId: 'b', row: 7, col: 8, playedAs: 'О' },
      { tileId: 'c', row: 7, col: 9, playedAs: 'Т' },
    ];
    applyPlacements(b, placements, tiles);
    expect(b[7]![7]?.tile.id).toBe('a');
    expect(b[7]![8]?.playedAs).toBe('О');
    expect(b[7]![9]?.fromBlank).toBe(false);
    expect(isEmpty(b)).toBe(false);
  });

  it('marks fromBlank when the tile is a blank', () => {
    const b = createEmptyBoard();
    const tiles = [tile('z', '', 0, true)];
    applyPlacements(b, [{ tileId: 'z', row: 0, col: 0, playedAs: 'А' }], tiles);
    expect(b[0]![0]?.fromBlank).toBe(true);
    expect(b[0]![0]?.playedAs).toBe('А');
  });

  it('throws on out-of-range coordinates', () => {
    const b = createEmptyBoard();
    expect(() =>
      applyPlacements(b, [{ tileId: 'x', row: 15, col: 0, playedAs: 'А' }], [tile('x', 'А', 1)]),
    ).toThrow();
  });

  it('throws when trying to place on an occupied cell', () => {
    const b = createEmptyBoard();
    const t1 = tile('a', 'А', 1);
    const t2 = tile('b', 'Б', 3);
    applyPlacements(b, [{ tileId: 'a', row: 0, col: 0, playedAs: 'А' }], [t1]);
    expect(() =>
      applyPlacements(b, [{ tileId: 'b', row: 0, col: 0, playedAs: 'Б' }], [t2]),
    ).toThrow();
  });
});
