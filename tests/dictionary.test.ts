import { describe, it, expect } from 'vitest';
import { checkWords } from '../server/dictionary.js';

describe('checkWords', () => {
  it('returns empty for known nouns', () => {
    expect(checkWords(['КОТ'])).toEqual([]);
  });
  it('flags unknown words', () => {
    expect(checkWords(['ЯБЛЫРГ'])).toEqual(['ЯБЛЫРГ']);
  });
  it('accepts both ЁЛКА and ЕЛКА', () => {
    expect(checkWords(['ЁЛКА'])).toEqual([]);
    expect(checkWords(['ЕЛКА'])).toEqual([]);
  });
  it('case-insensitive on input', () => {
    expect(checkWords(['кот'])).toEqual([]);
  });
  it('accepts both Ъ and Ь substituted forms', () => {
    expect(checkWords(['АБЪЮРАЦИЯ'])).toEqual([]);
    expect(checkWords(['АБЬЮРАЦИЯ'])).toEqual([]);
  });
  it('excludes proper-noun-only entries', () => {
    // ИВАН is only a personal name, never a common noun — must be flagged.
    expect(checkWords(['ИВАН'])).toEqual(['ИВАН']);
  });
});
