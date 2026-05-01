// tests/scoring.test.ts
import { describe, it, expect } from 'vitest';
import { scoreMove } from '../server/scoring';
import { createEmptyBoard, applyPlacements, extractWordsFormed, SIZE } from '../server/board';
import { PREMIUMS } from '@shared/premiums';
import type { Placement, Tile } from '@shared/types';

const tile = (id: string, letter: string, points: number, isBlank = false): Tile => ({
  id, letter, points, isBlank,
});

describe('scoring', () => {
  it('plain word, no bonuses (away from center)', () => {
    const b = createEmptyBoard();
    // Place at row 0, cols 1-3 — none of those squares are premium except (0,3) which is DL.
    // To avoid that, use row 0 cols 4-6 → all '.' squares.
    const tiles = [tile('a', 'К', 2), tile('b', 'О', 1), tile('c', 'Т', 1)];
    const placements: Placement[] = [
      { tileId: 'a', row: 0, col: 4, playedAs: 'К' },
      { tileId: 'b', row: 0, col: 5, playedAs: 'О' },
      { tileId: 'c', row: 0, col: 6, playedAs: 'Т' },
    ];
    applyPlacements(b, placements, tiles);
    const words = extractWordsFormed(b, placements);
    const result = scoreMove(b, words, placements, { centerBonusUsed: false });
    // 2 + 1 + 1 = 4, no multipliers
    expect(result.totalScore).toBe(4);
    expect(result.bingoBonus).toBe(false);
  });

  it('center DW fires once (first time)', () => {
    const b = createEmptyBoard();
    const tiles = [tile('a', 'К', 2), tile('b', 'О', 1), tile('c', 'Т', 1)];
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 6, playedAs: 'К' },
      { tileId: 'b', row: 7, col: 7, playedAs: 'О' }, // CENTER (acts as DW first time)
      { tileId: 'c', row: 7, col: 8, playedAs: 'Т' },
    ];
    applyPlacements(b, placements, tiles);
    const words = extractWordsFormed(b, placements);
    const result = scoreMove(b, words, placements, { centerBonusUsed: false });
    // (2 + 1 + 1) * 2 = 8
    expect(result.totalScore).toBe(8);
    expect(result.centerNowUsed).toBe(true);
  });

  it('center DW does NOT fire once already used', () => {
    const b = createEmptyBoard();
    // pre-place lone tile at center via prior turn (simulated).
    applyPlacements(b, [{ tileId: 'x', row: 7, col: 7, playedAs: 'О' }], [tile('x', 'О', 1)]);
    // Now play "К" (left) and "Т" (right) extending to КОТ.
    const tiles = [tile('a', 'К', 2), tile('c', 'Т', 1)];
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 6, playedAs: 'К' },
      { tileId: 'c', row: 7, col: 8, playedAs: 'Т' },
    ];
    applyPlacements(b, placements, tiles);
    const words = extractWordsFormed(b, placements);
    const result = scoreMove(b, words, placements, { centerBonusUsed: true });
    expect(result.totalScore).toBe(2 + 1 + 1); // no doubling — center already used
  });

  it('TW (corner) triples the word', () => {
    const b = createEmptyBoard();
    // Row 0 cols 0-2: TW at (0,0); cols 1,2 plain (per pattern: 'w..L...').
    const tiles = [tile('a', 'К', 2), tile('b', 'О', 1), tile('c', 'Т', 1)];
    const placements: Placement[] = [
      { tileId: 'a', row: 0, col: 0, playedAs: 'К' }, // TW
      { tileId: 'b', row: 0, col: 1, playedAs: 'О' },
      { tileId: 'c', row: 0, col: 2, playedAs: 'Т' },
    ];
    applyPlacements(b, placements, tiles);
    const words = extractWordsFormed(b, placements);
    const result = scoreMove(b, words, placements, { centerBonusUsed: false });
    expect(result.totalScore).toBe((2 + 1 + 1) * 3);
  });

  it('DL doubles a single tile, then word multipliers stack', () => {
    const b = createEmptyBoard();
    // (0,3) is DL (per pattern 'w..L...').
    // Place К at (0,3) DL, О at (0,4), Т at (0,5).
    const tiles = [tile('a', 'К', 2), tile('b', 'О', 1), tile('c', 'Т', 1)];
    const placements: Placement[] = [
      { tileId: 'a', row: 0, col: 3, playedAs: 'К' }, // DL
      { tileId: 'b', row: 0, col: 4, playedAs: 'О' },
      { tileId: 'c', row: 0, col: 5, playedAs: 'Т' },
    ];
    applyPlacements(b, placements, tiles);
    const words = extractWordsFormed(b, placements);
    const result = scoreMove(b, words, placements, { centerBonusUsed: false });
    // letter scores: 2*2 + 1 + 1 = 6, no word mult
    expect(result.totalScore).toBe(6);
  });

  it('reusable bonuses: a non-center DW fires every time', () => {
    const b = createEmptyBoard();
    // (1,1) is DW. Pre-place a tile there from a "prior turn".
    applyPlacements(b, [{ tileId: 'x', row: 1, col: 1, playedAs: 'А' }], [tile('x', 'А', 1)]);
    // Now play vertically through (1,1): place tiles at (0,1) and (2,1) → word formed at column 1, rows 0..2.
    const tiles = [tile('a', 'Б', 3), tile('c', 'Б', 3)];
    const placements: Placement[] = [
      { tileId: 'a', row: 0, col: 1, playedAs: 'Б' },
      { tileId: 'c', row: 2, col: 1, playedAs: 'Б' },
    ];
    applyPlacements(b, placements, tiles);
    const words = extractWordsFormed(b, placements);
    const result = scoreMove(b, words, placements, { centerBonusUsed: true });
    // letter scores: 3 + 1 + 3 = 7; word *2 (DW fires again) = 14
    expect(result.totalScore).toBe(14);
  });

  it('bingo bonus: +10 when all 7 tiles used', () => {
    const b = createEmptyBoard();
    const ts = [
      tile('a', 'А', 1), tile('b', 'Б', 3), tile('c', 'В', 1),
      tile('d', 'Г', 3), tile('e', 'Д', 2), tile('f', 'Е', 1), tile('g', 'Ж', 5),
    ];
    const placements: Placement[] = ts.map((t, i) => ({
      tileId: t.id, row: 7, col: 4 + i, playedAs: t.letter,
    }));
    applyPlacements(b, placements, ts);
    const words = extractWordsFormed(b, placements);
    // covers center (col 7) → DW
    const result = scoreMove(b, words, placements, { centerBonusUsed: false });
    // sum tile pts at cells: pattern row 7 "w..L...*...L..w"
    // cols 4..10 (chars indices 4..10 of pattern row 7): '.', '.', '.', '*', '.', '.', '.'  => no DL/TL/TW for letters; CENTER = DW once
    // letter scores: 1+3+1+3+2+1+5 = 16; word *2 = 32; +10 bingo = 42
    expect(result.totalScore).toBe(42);
    expect(result.bingoBonus).toBe(true);
  });

  it('multi-word move: scores all formed words and sums them', () => {
    const b = createEmptyBoard();
    // Pre-place О at (7,7) (center already used).
    applyPlacements(b, [{ tileId: 'x', row: 7, col: 7, playedAs: 'О' }], [tile('x', 'О', 1)]);
    // Play vertical "СН" through О → forms "СОН" (vertical). Also lays an extension to the side.
    // Just test crossword case: place С (6,7) and Н (8,7) — only forms "СОН".
    const placements: Placement[] = [
      { tileId: 'a', row: 6, col: 7, playedAs: 'С' },
      { tileId: 'c', row: 8, col: 7, playedAs: 'Н' },
    ];
    applyPlacements(b, placements, [tile('a', 'С', 1), tile('c', 'Н', 1)]);
    const words = extractWordsFormed(b, placements);
    const result = scoreMove(b, words, placements, { centerBonusUsed: true });
    // (1 + 1 + 1) — no premiums on (6,7),(7,7),(8,7) per pattern; center already used
    expect(result.totalScore).toBe(3);
  });

  it('blank tile contributes 0 letter points (playedAs.points)', () => {
    const b = createEmptyBoard();
    const ts = [
      tile('a', 'К', 2),
      tile('b', '', 0, true), // blank played as О
      tile('c', 'Т', 1),
    ];
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 6, playedAs: 'К' },
      { tileId: 'b', row: 7, col: 7, playedAs: 'О' }, // center DW
      { tileId: 'c', row: 7, col: 8, playedAs: 'Т' },
    ];
    applyPlacements(b, placements, ts);
    const words = extractWordsFormed(b, placements);
    const result = scoreMove(b, words, placements, { centerBonusUsed: false });
    // letter scores: 2 + 0 + 1 = 3; *2 (center) = 6
    expect(result.totalScore).toBe(6);
  });
});
