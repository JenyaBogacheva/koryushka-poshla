import { describe, it, expect } from 'vitest';
import { checkWords } from '../server/dictionary';

describe('dictionary stub', () => {
  it('returns empty warnings for any words', () => {
    expect(checkWords([])).toEqual([]);
    expect(checkWords(['КОТ', 'СОН', 'ZZZ'])).toEqual([]);
  });
});
