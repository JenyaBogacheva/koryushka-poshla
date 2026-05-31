import type { DrawForOrderRecord, Slot } from '@shared/types';

// Full turn order from a жребий record. Tolerates games saved before turn-order-by-draw
// existed: those stored only `firstSlot` and played in seat order after it.
export function drawTurnOrder(ev: DrawForOrderRecord): [Slot, Slot, Slot] {
  if (ev.order) return ev.order;
  const first = (ev as unknown as { firstSlot?: Slot }).firstSlot ?? 0;
  return [first, ((first + 1) % 3) as Slot, ((first + 2) % 3) as Slot];
}
