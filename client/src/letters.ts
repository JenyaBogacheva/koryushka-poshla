import type { Letter } from '@shared/types';

export const CYRILLIC_LETTERS: Letter[] = [
  'А','Б','В','Г','Д','Е','Ё','Ж','З','И','Й','К','Л','М','Н','О','П',
  'Р','С','Т','У','Ф','Х','Ц','Ч','Ш','Щ','Ъ','Ы','Ь','Э','Ю','Я',
];

export const SUBSTITUTIONS: Record<Letter, Letter> = {
  'Ё': 'Е',
  'Ъ': 'Ь',
  'Ш': 'Щ',
  'Й': 'И',
};

export function canSubstitute(letter: Letter): boolean {
  return Object.prototype.hasOwnProperty.call(SUBSTITUTIONS, letter);
}
