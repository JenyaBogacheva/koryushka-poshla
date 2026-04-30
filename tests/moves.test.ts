// tests/moves.test.ts
import { describe, it, expect } from 'vitest';
import { validateMove } from '../server/moves';
import { createEmptyBoard, applyPlacements } from '../server/board';
import type { Placement, Tile } from '@shared/types';

const tile = (id: string, letter: string, isBlank = false): Tile => ({
  id, letter, points: 1, isBlank,
});

describe('validateMove', () => {
  it('first move must include the center', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', 'К'), tile('b', 'О'), tile('c', 'Т')];
    const placements: Placement[] = [
      { tileId: 'a', row: 0, col: 0, playedAs: 'К' },
      { tileId: 'b', row: 0, col: 1, playedAs: 'О' },
      { tileId: 'c', row: 0, col: 2, playedAs: 'Т' },
    ];
    const result = validateMove(b, rack, placements, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('first-move-must-cover-center');
  });

  it('first move that covers center is OK', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', 'К'), tile('b', 'О'), tile('c', 'Т')];
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 6, playedAs: 'К' },
      { tileId: 'b', row: 7, col: 7, playedAs: 'О' },
      { tileId: 'c', row: 7, col: 8, playedAs: 'Т' },
    ];
    expect(validateMove(b, rack, placements, true).ok).toBe(true);
  });

  it('subsequent move with disconnected group is rejected', () => {
    const b = createEmptyBoard();
    applyPlacements(b, [{ tileId: 'x', row: 7, col: 7, playedAs: 'О' }], [tile('x', 'О')]);
    const rack = [tile('a', 'К'), tile('b', 'А')];
    // Both new tiles at (0,0)-(0,1) — disconnected from (7,7).
    const placements: Placement[] = [
      { tileId: 'a', row: 0, col: 0, playedAs: 'К' },
      { tileId: 'b', row: 0, col: 1, playedAs: 'А' },
    ];
    const result = validateMove(b, rack, placements, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('group-not-connected');
  });

  it('multi-spot: each group must connect; mixed disconnected fails', () => {
    const b = createEmptyBoard();
    applyPlacements(b, [{ tileId: 'x', row: 7, col: 7, playedAs: 'О' }], [tile('x', 'О')]);
    const rack = [tile('a', 'К'), tile('b', 'А'), tile('c', 'З')];
    // Group 1 at (7,6) connects (adjacent to existing О); group 2 at (0,0) does not.
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 6, playedAs: 'К' },
      { tileId: 'b', row: 0, col: 0, playedAs: 'А' },
      { tileId: 'c', row: 0, col: 1, playedAs: 'З' },
    ];
    const result = validateMove(b, rack, placements, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('group-not-connected');
  });

  it('multi-spot: both groups connected is OK', () => {
    const b = createEmptyBoard();
    applyPlacements(b, [
      { tileId: 'x', row: 7, col: 7, playedAs: 'О' },
      { tileId: 'y', row: 0, col: 5, playedAs: 'А' },
    ], [tile('x', 'О'), tile('y', 'А')]);
    const rack = [tile('a', 'К'), tile('b', 'З')];
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 6, playedAs: 'К' }, // touches О
      { tileId: 'b', row: 0, col: 6, playedAs: 'З' }, // touches А
    ];
    expect(validateMove(b, rack, placements, false).ok).toBe(true);
  });

  it('rejects placements on occupied cells', () => {
    const b = createEmptyBoard();
    applyPlacements(b, [{ tileId: 'x', row: 7, col: 7, playedAs: 'О' }], [tile('x', 'О')]);
    const rack = [tile('a', 'К')];
    const placements: Placement[] = [{ tileId: 'a', row: 7, col: 7, playedAs: 'К' }];
    const result = validateMove(b, rack, placements, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('cell-occupied');
  });

  it('rejects out-of-range placements', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', 'К')];
    const placements: Placement[] = [{ tileId: 'a', row: 15, col: 0, playedAs: 'К' }];
    const result = validateMove(b, rack, placements, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('out-of-range');
  });

  it('rejects tiles not in the rack', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', 'К')];
    const placements: Placement[] = [{ tileId: 'zzz', row: 7, col: 7, playedAs: 'К' }];
    const result = validateMove(b, rack, placements, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('tile-not-in-rack');
  });

  it('rejects illegal substitutions', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', 'А')];
    const placements: Placement[] = [{ tileId: 'a', row: 7, col: 7, playedAs: 'Б' }];
    const result = validateMove(b, rack, placements, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('illegal-substitution');
  });

  it('accepts allowed substitutions', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', 'Ё'), tile('b', 'Ж'), tile('c', 'И')];
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 6, playedAs: 'Е' }, // Ё→Е
      { tileId: 'b', row: 7, col: 7, playedAs: 'Ж' },
      { tileId: 'c', row: 7, col: 8, playedAs: 'И' },
    ];
    expect(validateMove(b, rack, placements, true).ok).toBe(true);
  });

  it('blank tile may be played as any letter', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', '', true), tile('b', 'А'), tile('c', 'Б')];
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 6, playedAs: 'К' },
      { tileId: 'b', row: 7, col: 7, playedAs: 'А' },
      { tileId: 'c', row: 7, col: 8, playedAs: 'Б' },
    ];
    expect(validateMove(b, rack, placements, true).ok).toBe(true);
  });

  it('rejects empty placements', () => {
    const b = createEmptyBoard();
    const result = validateMove(b, [], [], true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('no-placements');
  });

  it('rejects duplicate target cells in one move', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', 'А'), tile('b', 'Б')];
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 7, playedAs: 'А' },
      { tileId: 'b', row: 7, col: 7, playedAs: 'Б' },
    ];
    const result = validateMove(b, rack, placements, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('duplicate-target');
  });

  it('rejects duplicate tileId across placements', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', 'А'), tile('b', 'Б')];
    // Same tileId 'a' used in two different cells
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 6, playedAs: 'А' },
      { tileId: 'a', row: 7, col: 7, playedAs: 'А' },
    ];
    const result = validateMove(b, rack, placements, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('duplicate-tile');
  });

  it('first move with disconnected group is rejected even if center is covered', () => {
    const b = createEmptyBoard();
    const rack = [tile('a', 'А'), tile('b', 'Б'), tile('c', 'В')];
    // One tile at center (7,7), and a disconnected pair at (0,0)-(0,1)
    const placements: Placement[] = [
      { tileId: 'a', row: 7, col: 7, playedAs: 'А' },
      { tileId: 'b', row: 0, col: 0, playedAs: 'Б' },
      { tileId: 'c', row: 0, col: 1, playedAs: 'В' },
    ];
    const result = validateMove(b, rack, placements, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('first-move-must-be-one-group');
  });
});
