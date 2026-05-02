import type { BadgeKind, GameEvent, MoveRecord, Slot } from '@shared/types';

const LONG_WORD_MIN = 7;
const BIG_MOVE_MIN = 50;
const RACK_SIZE = 7;

export function perMoveBadges(event: GameEvent | MoveRecord): BadgeKind[] {
  if (event.kind !== 'move') return [];
  const record = event as MoveRecord;
  const badges: BadgeKind[] = [];
  if (record.placements.length === RACK_SIZE) badges.push('bingo');
  if (record.wordsFormed.some((w) => [...w.word].length >= LONG_WORD_MIN)) badges.push('longWord');
  if (record.totalScore >= BIG_MOVE_MIN) badges.push('bigMove');
  return badges;
}

export function endGameBadges(
  _events: GameEvent[],
  _scores: Record<Slot, number>,
): Record<Slot, BadgeKind[]> {
  // Implemented in Task 5.
  return { 0: [], 1: [], 2: [] };
}
