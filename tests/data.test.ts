import { describe, it, expect } from 'vitest';
import { loadTileDistribution, totalTileCount } from '../server/data';

describe('tile distribution', () => {
  it('loads 105 tiles total', () => {
    const dist = loadTileDistribution();
    expect(totalTileCount(dist)).toBe(105);
  });

  it('includes 3 blanks', () => {
    const dist = loadTileDistribution();
    const blanks = dist.find((d) => d.isBlank);
    expect(blanks?.count).toBe(3);
    expect(blanks?.points).toBe(0);
  });

  it('every non-blank entry has a single Cyrillic letter and positive count', () => {
    const dist = loadTileDistribution();
    for (const entry of dist) {
      if (entry.isBlank) continue;
      expect(entry.letter).toMatch(/^[А-ЯЁ]$/);
      expect(entry.count).toBeGreaterThan(0);
      expect(entry.points).toBeGreaterThanOrEqual(1);
    }
  });
});
