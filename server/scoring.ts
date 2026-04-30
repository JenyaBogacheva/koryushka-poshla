import type { Board, Placement, WordFormed } from '@shared/types';
import { PREMIUMS } from '@shared/premiums.js';
import { loadTileDistribution } from './data/index.js';

const POINTS_BY_LETTER: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (const e of loadTileDistribution()) {
    if (!e.isBlank) m.set(e.letter, e.points);
  }
  return m;
})();

function pointsOfPlayedAs(letter: string): number {
  return POINTS_BY_LETTER.get(letter) ?? 0;
}

export type ScoreMoveOpts = { centerBonusUsed: boolean };

export type ScoreMoveResult = {
  totalScore: number;
  perWord: Array<WordFormed & { score: number }>;
  bingoBonus: boolean;
  centerNowUsed: boolean;
};

export function scoreMove(
  board: Board,
  words: WordFormed[],
  newPlacements: Placement[],
  opts: ScoreMoveOpts,
): ScoreMoveResult {
  let total = 0;
  const perWord: Array<WordFormed & { score: number }> = [];

  for (const w of words) {
    let letterSum = 0;
    let wordMult = 1;
    for (const c of w.cells) {
      const cell = board[c.row]![c.col]!;
      // Blanks score 0; otherwise look up the played-as letter's canonical points.
      const pts = cell.fromBlank ? 0 : pointsOfPlayedAs(cell.playedAs);
      const premium = PREMIUMS[c.row]![c.col];
      let letterScore = pts;
      if (premium === 'DL') letterScore *= 2;
      else if (premium === 'TL') letterScore *= 3;
      letterSum += letterScore;
      if (premium === 'DW') wordMult *= 2;
      else if (premium === 'TW') wordMult *= 3;
      else if (premium === 'CENTER' && !opts.centerBonusUsed) wordMult *= 2;
    }
    const wordScore = letterSum * wordMult;
    perWord.push({ ...w, score: wordScore });
    total += wordScore;
  }

  const bingoBonus = newPlacements.length === 7;
  if (bingoBonus) total += 10;

  const centerNowUsed = newPlacements.some((p) => p.row === 7 && p.col === 7);

  return { totalScore: total, perWord, bingoBonus, centerNowUsed };
}
