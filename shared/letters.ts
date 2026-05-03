import type { Letter } from './types.js';

export const CYRILLIC_LETTERS: Letter[] = [
  'А','Б','В','Г','Д','Е','Ё','Ж','З','И','Й','К','Л','М','Н','О','П',
  'Р','С','Т','У','Ф','Х','Ц','Ч','Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я',
];

// One-way house-rule substitutions: tile letter → allowed playedAs.
export const SUBSTITUTIONS: Record<string, Letter> = {
  'Ё': 'Е',
  'Ъ': 'Ь',
  'Щ': 'Ш',
  'Й': 'И',
};

// Points of the substituted letters — used by clients to preview the score
// before submission. The server is still the source of truth at scoring time.
export const SUBSTITUTION_POINTS: Record<Letter, number> = {
  'Е': 1,
  'Ь': 3,
  'Ш': 8,
  'И': 1,
} as Record<Letter, number>;

export function canSubstitute(letter: Letter): boolean {
  return Object.prototype.hasOwnProperty.call(SUBSTITUTIONS, letter);
}
