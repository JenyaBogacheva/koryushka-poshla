import type { Tile } from '@shared/types';
import { isVowel, isConsonant, isSign } from './letters.js';

export function removeTilesFromRack(rack: Tile[], tileIds: string[]): Tile[] {
  const removed: Tile[] = [];
  for (const id of tileIds) {
    const idx = rack.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Tile ${id} not in rack`);
    removed.push(rack.splice(idx, 1)[0]!);
  }
  return removed;
}

export function addTilesToRack(rack: Tile[], tiles: Tile[]): void {
  rack.push(...tiles);
}

export function isAllVowels(rack: Tile[]): boolean {
  if (rack.length === 0) return false;
  return rack.every((t) => !t.isBlank && (isVowel(t.letter) || isSign(t.letter)));
}

export function isAllConsonants(rack: Tile[]): boolean {
  if (rack.length === 0) return false;
  return rack.every((t) => !t.isBlank && (isConsonant(t.letter) || isSign(t.letter)));
}

export function redrawEligible(rack: Tile[]): boolean {
  return isAllVowels(rack) || isAllConsonants(rack);
}
