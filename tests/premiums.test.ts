import { describe, it, expect } from 'vitest';
import { PREMIUMS } from '@shared/premiums';

describe('premium-square map', () => {
  it('is 15×15', () => {
    expect(PREMIUMS.length).toBe(15);
    for (const row of PREMIUMS) expect(row.length).toBe(15);
  });

  it('has the four corners as TW', () => {
    expect(PREMIUMS[0]![0]).toBe('TW');
    expect(PREMIUMS[0]![14]).toBe('TW');
    expect(PREMIUMS[14]![0]).toBe('TW');
    expect(PREMIUMS[14]![14]).toBe('TW');
  });

  it('has the center as CENTER', () => {
    expect(PREMIUMS[7]![7]).toBe('CENTER');
  });

  it('has known DW square at (1,1)', () => {
    expect(PREMIUMS[1]![1]).toBe('DW');
  });

  it('has known TL square at (1,5)', () => {
    expect(PREMIUMS[1]![5]).toBe('TL');
  });

  it('has known DL square at (0,3)', () => {
    expect(PREMIUMS[0]![3]).toBe('DL');
  });

  it('is mirror-symmetric on both axes', () => {
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        expect(PREMIUMS[r]![c]).toBe(PREMIUMS[r]![14 - c]);
        expect(PREMIUMS[r]![c]).toBe(PREMIUMS[14 - r]![c]);
      }
    }
  });
});
