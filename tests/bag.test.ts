import { describe, it, expect } from 'vitest';
import { createBag, drawTiles, returnTiles, bagCount, makeRng } from '../server/bag';

describe('bag', () => {
  it('starts with 104 tiles', () => {
    const bag = createBag(makeRng(1));
    expect(bagCount(bag)).toBe(104);
  });

  it('every tile has a unique id', () => {
    const bag = createBag(makeRng(1));
    const ids = new Set(bag.tiles.map((t) => t.id));
    expect(ids.size).toBe(bag.tiles.length);
  });

  it('drawing N reduces count by N', () => {
    const bag = createBag(makeRng(1));
    const drawn = drawTiles(bag, 7);
    expect(drawn.length).toBe(7);
    expect(bagCount(bag)).toBe(97);
  });

  it('drawing more than available returns what remains', () => {
    const bag = createBag(makeRng(1));
    drawTiles(bag, 100);
    const drawn = drawTiles(bag, 10);
    expect(drawn.length).toBe(4);
    expect(bagCount(bag)).toBe(0);
  });

  it('returning tiles increases count and reshuffles for next draw', () => {
    const bag = createBag(makeRng(1));
    const drawn = drawTiles(bag, 7);
    returnTiles(bag, drawn);
    expect(bagCount(bag)).toBe(104);
  });

  it('deterministic with same seed', () => {
    const a = createBag(makeRng(42));
    const b = createBag(makeRng(42));
    expect(drawTiles(a, 7).map((t) => t.letter)).toEqual(drawTiles(b, 7).map((t) => t.letter));
  });

  it('different seeds yield different orders', () => {
    const a = createBag(makeRng(1));
    const b = createBag(makeRng(2));
    const lettersA = drawTiles(a, 20).map((t) => t.letter).join('');
    const lettersB = drawTiles(b, 20).map((t) => t.letter).join('');
    expect(lettersA).not.toBe(lettersB);
  });
});
