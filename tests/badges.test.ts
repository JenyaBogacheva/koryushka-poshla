import { describe, it, expect } from 'vitest';
import { perMoveBadges } from '@shared/badges.js';
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
    expect(perMoveBadges(pass)).toEqual([]);
  });
});

import { endGameBadges } from '@shared/badges.js';
import type { AssistRecord, Slot } from '@shared/types';

function assist(fromSlot: Slot, toSlot: Slot): AssistRecord {
  return { kind: 'assist', fromSlot, toSlot, points: 5, forMoveIndex: 0, timestamp: 0 };
}

describe('endGameBadges — places', () => {
  it('awards gold/silver/bronze for distinct scores', () => {
    const out = endGameBadges([], { 0: 100, 1: 80, 2: 60 });
    expect(out[0]).toEqual(['gold']);
    expect(out[1]).toEqual(['silver']);
    expect(out[2]).toEqual(['bronze']);
  });

  it('shares gold and skips silver on 1st-place tie', () => {
    const out = endGameBadges([], { 0: 100, 1: 100, 2: 60 });
    expect(out[0]).toEqual(['gold']);
    expect(out[1]).toEqual(['gold']);
    expect(out[2]).toEqual(['bronze']);
  });

  it('shares silver and skips bronze on 2nd-place tie', () => {
    const out = endGameBadges([], { 0: 100, 1: 80, 2: 80 });
    expect(out[0]).toEqual(['gold']);
    expect(out[1]).toEqual(['silver']);
    expect(out[2]).toEqual(['silver']);
  });

  it('three-way tie → three golds', () => {
    const out = endGameBadges([], { 0: 50, 1: 50, 2: 50 });
    expect(out[0]).toEqual(['gold']);
    expect(out[1]).toEqual(['gold']);
    expect(out[2]).toEqual(['gold']);
  });

  it('mapping is by score, not slot order', () => {
    const out = endGameBadges([], { 0: 60, 1: 100, 2: 80 });
    expect(out[0]).toEqual(['bronze']);
    expect(out[1]).toEqual(['gold']);
    expect(out[2]).toEqual(['silver']);
  });
});

describe('endGameBadges — helper', () => {
  it('awards helper to single max-assist helper (toSlot)', () => {
    // toSlot counts: 1 → 1, 2 → 2 → slot 2 wins.
    const events = [assist(0, 1), assist(0, 2), assist(1, 2)];
    const out = endGameBadges(events, { 0: 50, 1: 30, 2: 30 });
    expect(out[2]).toContain('helper');
    expect(out[0]).not.toContain('helper');
    expect(out[1]).not.toContain('helper');
  });

  it('shares helper on tie (by toSlot)', () => {
    // toSlot counts: 0 → 1, 2 → 1 → tie between 0 and 2.
    const events = [assist(1, 0), assist(1, 2)];
    const out = endGameBadges(events, { 0: 50, 1: 50, 2: 50 });
    expect(out[0]).toContain('helper');
    expect(out[2]).toContain('helper');
    expect(out[1]).not.toContain('helper');
  });

  it('no helper if no assists', () => {
    const out = endGameBadges([], { 0: 10, 1: 10, 2: 10 });
    expect(out[0]).not.toContain('helper');
    expect(out[1]).not.toContain('helper');
    expect(out[2]).not.toContain('helper');
  });

  it('place badge appears before helper in returned array', () => {
    // assist(0, 1): helper is slot 1. Slot 1 has silver + helper.
    const events = [assist(0, 1)];
    const out = endGameBadges(events, { 0: 100, 1: 80, 2: 60 });
    expect(out[1]).toEqual(['silver', 'helper']);
  });
});
