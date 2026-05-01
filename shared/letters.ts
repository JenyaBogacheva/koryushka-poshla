import type { Letter } from './types.js';

export const CYRILLIC_LETTERS: Letter[] = [
  'А','Б','В','Г','Д','Е','Ё','Ж','З','И','Й','К','Л','М','Н','О','П',
  'Р','С','Т','У','Ф','Х','Ц','Ч','Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я',
];

// One-way house-rule substitutions: tile letter → allowed playedAs.
export const SUBSTITUTIONS: Record<string, Letter> = {
  'Ё': 'Е',
  'Ъ': 'Ь',
  'Ш': 'Щ',
  'Й': 'И',
};

export function canSubstitute(letter: Letter): boolean {
  return Object.prototype.hasOwnProperty.call(SUBSTITUTIONS, letter);
}
