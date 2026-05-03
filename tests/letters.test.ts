import { describe, it, expect } from 'vitest';
import { isVowel, isConsonant, isSubstitutionAllowed, compareLetterOrder } from '../server/letters';

describe('letters', () => {
  it('identifies vowels', () => {
    for (const v of ['А', 'Е', 'Ё', 'И', 'О', 'У', 'Ы', 'Э', 'Ю', 'Я']) {
      expect(isVowel(v)).toBe(true);
      expect(isConsonant(v)).toBe(false);
    }
  });

  it('identifies consonants', () => {
    for (const c of ['Б', 'В', 'Г', 'Д', 'Ж', 'З', 'Й', 'К', 'Л', 'М', 'Н', 'П', 'Р', 'С', 'Т', 'Ф', 'Х', 'Ц', 'Ч', 'Ш', 'Щ']) {
      expect(isConsonant(c)).toBe(true);
      expect(isVowel(c)).toBe(false);
    }
  });

  it('treats Ъ and Ь as signs (neither vowel nor consonant)', () => {
    for (const s of ['Ъ', 'Ь']) {
      expect(isVowel(s)).toBe(false);
      expect(isConsonant(s)).toBe(false);
    }
  });

  it('allows the four one-way substitutions', () => {
    expect(isSubstitutionAllowed('Ё', 'Е')).toBe(true);
    expect(isSubstitutionAllowed('Ъ', 'Ь')).toBe(true);
    expect(isSubstitutionAllowed('Щ', 'Ш')).toBe(true);
    expect(isSubstitutionAllowed('Й', 'И')).toBe(true);
  });

  it('rejects the reverse direction', () => {
    expect(isSubstitutionAllowed('Е', 'Ё')).toBe(false);
    expect(isSubstitutionAllowed('Ь', 'Ъ')).toBe(false);
    expect(isSubstitutionAllowed('Ш', 'Щ')).toBe(false);
    expect(isSubstitutionAllowed('И', 'Й')).toBe(false);
  });

  it('treats identity as allowed (no substitution)', () => {
    expect(isSubstitutionAllowed('А', 'А')).toBe(true);
    expect(isSubstitutionAllowed('Ш', 'Ш')).toBe(true);
  });

  it('rejects arbitrary unrelated substitutions', () => {
    expect(isSubstitutionAllowed('А', 'Б')).toBe(false);
    expect(isSubstitutionAllowed('К', 'Л')).toBe(false);
  });
});

describe('compareLetterOrder', () => {
  it('null (blank) beats any letter', () => {
    expect(compareLetterOrder(null, 'А')).toBeLessThan(0);
    expect(compareLetterOrder('А', null)).toBeGreaterThan(0);
  });
  it('two blanks tie', () => {
    expect(compareLetterOrder(null, null)).toBe(0);
  });
  it('orders by alphabet position', () => {
    expect(compareLetterOrder('А', 'Б')).toBeLessThan(0);
    expect(compareLetterOrder('Я', 'А')).toBeGreaterThan(0);
  });
  it('equal letters tie', () => {
    expect(compareLetterOrder('К', 'К')).toBe(0);
  });
});
