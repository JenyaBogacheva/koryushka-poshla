import { describe, it, expect } from 'vitest';
import { perMoveBadges } from '@server/badges.js';
import type { MoveRecord, PassRecord } from '@shared/types';

function move(overrides: Partial<MoveRecord> = {}): MoveRecord {
  return {
    kind: 'move',
    slot: 0,
    placements: [],
    wordsFormed: [],
    totalScore: 0,
    bingoBonus: false,
    helperSlot: null,
    dictionaryWarnings: [],
    timestamp: 0,
    ...overrides,
  };
}

function placements(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    tileId: `t-${i}`,
    row: 7,
    col: i,
    playedAs: 'А',
  }));
}

function word(letters: string) {
  return {
    word: letters,
    cells: Array.from({ length: letters.length }, (_, i) => ({ row: 7, col: i })),
    score: 0,
  };
}

describe('perMoveBadges', () => {
  it('awards bingo when 7 tiles are placed', () => {
    const r = move({ placements: placements(7), wordsFormed: [word('КОРЮШКА')], totalScore: 60, bingoBonus: true });
    expect(perMoveBadges(r).sort()).toEqual(['bigMove', 'bingo', 'longWord']);
  });

  it('does not award bingo on 6 tiles', () => {
    const r = move({ placements: placements(6), wordsFormed: [word('КАРТА')], totalScore: 12 });
    expect(perMoveBadges(r)).toEqual([]);
  });

  it('awards longWord for any 7+ letter word formed', () => {
    const r = move({ placements: placements(2), wordsFormed: [word('КОРОТКО'), word('ДА')], totalScore: 20 });
    expect(perMoveBadges(r)).toEqual(['longWord']);
  });

  it('does not award longWord at length 6', () => {
    const r = move({ placements: placements(2), wordsFormed: [word('КАРТЫ')], totalScore: 12 });
    expect(perMoveBadges(r)).toEqual([]);
  });

  it('awards bigMove at exactly 50 points', () => {
    const r = move({ placements: placements(3), wordsFormed: [word('КАРТА')], totalScore: 50 });
    expect(perMoveBadges(r)).toEqual(['bigMove']);
  });

  it('does not award bigMove at 49 points', () => {
    const r = move({ placements: placements(3), wordsFormed: [word('КАРТА')], totalScore: 49 });
    expect(perMoveBadges(r)).toEqual([]);
  });

  it('returns [] for non-move events', () => {
    const pass: PassRecord = { kind: 'pass', slot: 1, timestamp: 0 };
    expect(perMoveBadges(pass as unknown as MoveRecord)).toEqual([]);
  });
});
