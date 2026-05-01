import type { Tile } from '@shared/types';
import { loadTileDistribution } from './data/index.js';

export type Rng = () => number; // returns float in [0, 1)

// Mulberry32 — small, deterministic, seedable.
export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Bag = {
  tiles: Tile[]; // last index is "top of bag" — drawTiles pops the end for O(1).
  rng: Rng;
};

export function createBag(rng: Rng): Bag {
  const dist = loadTileDistribution();
  const tiles: Tile[] = [];
  let nextId = 0;
  for (const entry of dist) {
    for (let i = 0; i < entry.count; i++) {
      tiles.push({
        id: `t-${(nextId++).toString().padStart(3, '0')}`,
        letter: entry.letter,
        points: entry.points,
        isBlank: entry.isBlank,
      });
    }
  }
  shuffleInPlace(tiles, rng);
  return { tiles, rng };
}

export function bagCount(bag: Bag): number {
  return bag.tiles.length;
}

export function bagFromTiles(tiles: Tile[], rng: Rng): Bag {
  return { tiles: [...tiles], rng };
}

export function drawTiles(bag: Bag, n: number): Tile[] {
  const drawn: Tile[] = [];
  for (let i = 0; i < n && bag.tiles.length > 0; i++) {
    drawn.push(bag.tiles.pop()!);
  }
  return drawn;
}

export function returnTiles(bag: Bag, tiles: Tile[]): void {
  bag.tiles.push(...tiles);
  shuffleInPlace(bag.tiles, bag.rng);
}

function shuffleInPlace<T>(arr: T[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
