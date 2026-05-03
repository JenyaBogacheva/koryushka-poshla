import type { BadgeKind, GameEvent, Slot } from './types.js';

const LONG_WORD_MIN = 7;
const BIG_MOVE_MIN = 50;
const RACK_SIZE = 7;

export function perMoveBadges(event: GameEvent): BadgeKind[] {
  if (event.kind !== 'move') return [];
  const badges: BadgeKind[] = [];
  if (event.placements.length === RACK_SIZE) badges.push('bingo');
  if (event.wordsFormed.some((w) => [...w.word].length >= LONG_WORD_MIN)) badges.push('longWord');
  if (event.totalScore >= BIG_MOVE_MIN) badges.push('bigMove');
  return badges;
}

export function endGameBadges(
  events: GameEvent[],
  scores: Record<Slot, number>,
): Record<Slot, BadgeKind[]> {
  const slots: Slot[] = [0, 1, 2];
  const result: Record<Slot, BadgeKind[]> = { 0: [], 1: [], 2: [] };

  // Place badges. Sort distinct scores descending; first three buckets are gold/silver/bronze,
  // skipping a medal whenever the previous bucket had more than one slot in it.
  const distinctScoresDesc = [...new Set(slots.map((s) => scores[s]))].sort((a, b) => b - a);
  const buckets = distinctScoresDesc.map((score) => slots.filter((s) => scores[s] === score));

  const medals: BadgeKind[] = ['gold', 'silver', 'bronze'];
  let medalIndex = 0;
  for (const bucket of buckets) {
    if (medalIndex >= medals.length) break;
    const medal = medals[medalIndex]!;
    for (const slot of bucket) result[slot].push(medal);
    medalIndex += bucket.length;
  }

  // Helper badge: most assists given (AssistRecord.toSlot is the helper). Ties → all winners. Zero → no one.
  const assistsBySlot: Record<Slot, number> = { 0: 0, 1: 0, 2: 0 };
  for (const e of events) {
    if (e.kind === 'assist') assistsBySlot[e.toSlot] += 1;
  }
  const maxAssists = Math.max(assistsBySlot[0], assistsBySlot[1], assistsBySlot[2]);
  if (maxAssists > 0) {
    for (const s of slots) {
      if (assistsBySlot[s] === maxAssists) result[s].push('helper');
    }
  }

  return result;
}
