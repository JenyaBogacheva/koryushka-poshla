import type { Premium, PremiumMap } from './types.js';

// Standard Scrabble premium-square layout (also used by Russian Эрудит).
// Encoding: '.' = none, 'L' = DL, 'l' = TL, 'W' = DW, 'w' = TW, '*' = center.
const PATTERN: string[] = [
  'w..L...w...L..w',
  '.W...l...l...W.',
  '..W...L.L...W..',
  'L..W...L...W..L',
  '....W.....W....',
  '.l...l...l...l.',
  '..L...L.L...L..',
  'w..L...*...L..w',
  '..L...L.L...L..',
  '.l...l...l...l.',
  '....W.....W....',
  'L..W...L...W..L',
  '..W...L.L...W..',
  '.W...l...l...W.',
  'w..L...w...L..w',
];

function decode(ch: string): Premium {
  switch (ch) {
    case 'w': return 'TW';
    case 'W': return 'DW';
    case 'l': return 'TL';
    case 'L': return 'DL';
    case '*': return 'CENTER';
    case '.': return null;
    default: throw new Error(`Unknown premium char: ${ch}`);
  }
}

export const PREMIUMS: PremiumMap = PATTERN.map((row) =>
  Array.from(row).map(decode),
);
