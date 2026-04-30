import { describe, it, expect } from 'vitest';
import { createEmptyBoard, applyPlacements, isEmpty, extractWordsFormed } from '../server/board';
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

function place(board: ReturnType<typeof createEmptyBoard>, coords: [number, number, string][]) {
  const tiles = coords.map(([r, c, l], i) => tile(`${r}-${c}-${i}`, l, 1));
  const placements: Placement[] = coords.map(([r, c, l], i) => ({
    tileId: tiles[i]!.id, row: r, col: c, playedAs: l,
  }));
  applyPlacements(board, placements, tiles);
  return placements;
}

describe('word extraction', () => {
  it('finds a single horizontal word', () => {
    const b = createEmptyBoard();
    const placements = place(b, [[7, 6, 'К'], [7, 7, 'О'], [7, 8, 'Т']]);
    const words = extractWordsFormed(b, placements);
    expect(words.length).toBe(1);
    expect(words[0]!.word).toBe('КОТ');
    expect(words[0]!.cells).toEqual([
      { row: 7, col: 6 }, { row: 7, col: 7 }, { row: 7, col: 8 },
    ]);
  });

  it('finds a vertical main word', () => {
    const b = createEmptyBoard();
    const placements = place(b, [[6, 7, 'С'], [7, 7, 'О'], [8, 7, 'Н']]);
    const words = extractWordsFormed(b, placements);
    expect(words.length).toBe(1);
    expect(words[0]!.word).toBe('СОН');
  });

  it('extends an existing word and finds the new full word only', () => {
    const b = createEmptyBoard();
    place(b, [[7, 6, 'К'], [7, 7, 'О'], [7, 8, 'Т']]); // existing КОТ
    // play "Ы" at (7,9) extending КОТ to КОТЫ
    const placements = place(b, [[7, 9, 'Ы']]);
    const words = extractWordsFormed(b, placements);
    expect(words.length).toBe(1);
    expect(words[0]!.word).toBe('КОТЫ');
  });

  it('finds main word + perpendicular crosswords', () => {
    const b = createEmptyBoard();
    place(b, [[7, 6, 'К'], [7, 7, 'О'], [7, 8, 'Т']]); // existing КОТ horizontally
    // play vertical "СН" using existing О at (7,7): С at (6,7), Н at (8,7) -> word "СОН"
    const placements = place(b, [[6, 7, 'С'], [8, 7, 'Н']]);
    const words = extractWordsFormed(b, placements);
    const set = new Set(words.map((w) => w.word));
    expect(set).toEqual(new Set(['СОН']));
    // КОТ is unchanged (no new tiles in it) → not reported.
  });

  it('finds side words formed by adjacency', () => {
    const b = createEmptyBoard();
    place(b, [[7, 7, 'О']]); // lone О
    // Play "АТ" horizontally — А at (7,8), Т at (7,9). Forms main word "ОАТ" (nonsense, but that's the rules — we don't validate here).
    // Also no perpendicular new words formed (A and T have nothing above/below).
    const placements = place(b, [[7, 8, 'А'], [7, 9, 'Т']]);
    const words = extractWordsFormed(b, placements);
    const w = words.map((x) => x.word).sort();
    expect(w).toEqual(['ОАТ']);
  });

  it('returns words in two disconnected groups', () => {
    const b = createEmptyBoard();
    place(b, [[7, 7, 'А']]);
    // Place ДА at (0,0)-(0,1), and Б adjacent to А making "БА" at (7,6)-(7,7) — two groups in one move.
    const placements = place(b, [[0, 0, 'Д'], [0, 1, 'А'], [7, 6, 'Б']]);
    const words = extractWordsFormed(b, placements);
    const w = words.map((x) => x.word).sort();
    expect(w).toEqual(['БА', 'ДА']);
  });

  it('uses playedAs (substitution) in word letters, not the physical tile letter', () => {
    const b = createEmptyBoard();
    // Tile is Ё but played as Е → word should read "ЕЛЬ" not "ЁЛЬ"
    const tiles = [
      { id: 't1', letter: 'Ё', points: 3, isBlank: false },
      { id: 't2', letter: 'Л', points: 2, isBlank: false },
      { id: 't3', letter: 'Ь', points: 3, isBlank: false },
    ];
    const placements: Placement[] = [
      { tileId: 't1', row: 7, col: 6, playedAs: 'Е' },
      { tileId: 't2', row: 7, col: 7, playedAs: 'Л' },
      { tileId: 't3', row: 7, col: 8, playedAs: 'Ь' },
    ];
    applyPlacements(b, placements, tiles);
    const words = extractWordsFormed(b, placements);
    expect(words.length).toBe(1);
    expect(words[0]!.word).toBe('ЕЛЬ');
  });
});
