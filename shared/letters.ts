import type { Letter } from './types.js';

export const CYRILLIC_LETTERS: Letter[] = [
  'А','Б','В','Г','Д','Е','Ё','Ж','З','И','Й','К','Л','М','Н','О','П',
  'Р','С','Т','У','Ф','Х','Ц','Ч','Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я',
];

// Bidirectional house-rule substitutions: tile letter → its allowed partner.
// Any letter in this map may be played as its partner (and vice versa);
// scoring uses the played-as letter's canonical points.
export const SUBSTITUTIONS: Record<string, Letter> = {
  'Ё': 'Е', 'Е': 'Ё',
  'Ъ': 'Ь', 'Ь': 'Ъ',
  'Щ': 'Ш', 'Ш': 'Щ',
  'Й': 'И', 'И': 'Й',
};

// Points of every letter that participates in a substitution pair — used by
// clients to preview the score before submission. Server is the source of
// truth at scoring time.
export const SUBSTITUTION_POINTS: Record<Letter, number> = {
  'Е': 1, 'Ё': 3,
  'Ь': 3, 'Ъ': 10,
  'Ш': 8, 'Щ': 10,
  'И': 1, 'Й': 4,
} as Record<Letter, number>;

export function canSubstitute(letter: Letter): boolean {
  return Object.prototype.hasOwnProperty.call(SUBSTITUTIONS, letter);
}

// Face-value points a tile contributes when played as `playedAs`: the played-as
// letter's canonical points (what the server scores), falling back to the tile's
// own points when it isn't a substitution. Blanks score 0 — handle that before
// calling. Used for both pending previews and committed-cell display.
export function substitutionPoints(playedAs: Letter, tile: { letter: Letter; points: number }): number {
  return playedAs === tile.letter ? tile.points : (SUBSTITUTION_POINTS[playedAs] ?? tile.points);
}
