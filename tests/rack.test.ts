// tests/rack.test.ts
import { describe, it, expect } from 'vitest';
import { removeTilesFromRack, addTilesToRack, isAllVowels, isAllConsonants, redrawEligible } from '../server/rack';
import type { Tile } from '@shared/types';

const t = (id: string, letter: string, isBlank = false): Tile => ({
  id, letter, points: 0, isBlank,
});

describe('rack', () => {
  it('removes tiles by id', () => {
    const rack = [t('a', 'А'), t('b', 'Б'), t('c', 'В')];
    const removed = removeTilesFromRack(rack, ['b']);
    expect(removed.map((x) => x.id)).toEqual(['b']);
    expect(rack.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('throws if a requested id is absent', () => {
    expect(() => removeTilesFromRack([t('a', 'А')], ['x'])).toThrow();
  });

  it('adds tiles', () => {
    const rack = [t('a', 'А')];
    addTilesToRack(rack, [t('b', 'Б')]);
    expect(rack.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('all-vowels detected', () => {
    const rack = [t('1', 'А'), t('2', 'Е'), t('3', 'И'), t('4', 'О'), t('5', 'У'), t('6', 'Я'), t('7', 'Ы')];
    expect(isAllVowels(rack)).toBe(true);
    expect(isAllConsonants(rack)).toBe(false);
    expect(redrawEligible(rack)).toBe(true);
  });

  it('all-consonants detected', () => {
    const rack = [t('1', 'Б'), t('2', 'В'), t('3', 'Г'), t('4', 'Д'), t('5', 'К'), t('6', 'Л'), t('7', 'М')];
    expect(isAllConsonants(rack)).toBe(true);
    expect(isAllVowels(rack)).toBe(false);
    expect(redrawEligible(rack)).toBe(true);
  });

  it('mixed rack: not eligible', () => {
    const rack = [t('1', 'А'), t('2', 'Б')];
    expect(redrawEligible(rack)).toBe(false);
  });

  it('rack with a sign (Ъ) is not all-vowels nor all-consonants', () => {
    const rack = [t('1', 'Б'), t('2', 'В'), t('3', 'Ъ')];
    expect(isAllVowels(rack)).toBe(false);
    expect(isAllConsonants(rack)).toBe(false);
    expect(redrawEligible(rack)).toBe(false);
  });

  it('blank tile prevents both labels (rack is "mixed")', () => {
    const rack = [t('1', 'А'), t('2', '', true)];
    expect(isAllVowels(rack)).toBe(false);
    expect(isAllConsonants(rack)).toBe(false);
    expect(redrawEligible(rack)).toBe(false);
  });

  it('empty rack is neither', () => {
    expect(isAllVowels([])).toBe(false);
    expect(isAllConsonants([])).toBe(false);
    expect(redrawEligible([])).toBe(false);
  });
});
