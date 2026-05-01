import type { Letter } from '@shared/types';
import { SUBSTITUTIONS } from '@shared/letters.js';

const VOWELS = new Set(['А', 'Е', 'Ё', 'И', 'О', 'У', 'Ы', 'Э', 'Ю', 'Я']);
const CONSONANTS = new Set([
  'Б','В','Г','Д','Ж','З','Й','К','Л','М','Н','П','Р','С','Т','Ф','Х','Ц','Ч','Ш','Щ',
]);
const SIGNS = new Set(['Ъ', 'Ь']);

export function isVowel(letter: Letter): boolean {
  return VOWELS.has(letter);
}

export function isConsonant(letter: Letter): boolean {
  return CONSONANTS.has(letter);
}

export function isCyrillicLetter(value: string): boolean {
  return VOWELS.has(value) || CONSONANTS.has(value) || SIGNS.has(value);
}

/**
 * True iff a tile with `tileLetter` may be played as `playedAs`.
 * Identity is always allowed; named substitutions are allowed one-way only.
 */
export function isSubstitutionAllowed(tileLetter: Letter, playedAs: Letter): boolean {
  if (tileLetter === playedAs) return true;
  return SUBSTITUTIONS[tileLetter] === playedAs;
}
