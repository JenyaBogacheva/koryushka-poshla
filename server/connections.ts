import type { WebSocket } from 'ws';
import type { Slot } from '@shared/types';

export type Seat = {
  ws: WebSocket | null;
  name: string | null;
};

export type Seats = [Seat, Seat, Seat];

export type SeatResult =
  | { ok: true; replaced: WebSocket | null }
  | { ok: false; reason: string };

export function createSeats(): Seats {
  return [
    { ws: null, name: null },
    { ws: null, name: null },
    { ws: null, name: null },
  ];
}

export function seat(seats: Seats, slot: Slot, name: string, ws: WebSocket): SeatResult {
  const s = seats[slot]!;
  if (s.name !== null && s.name !== name) {
    return { ok: false, reason: 'Slot taken' };
  }
  const replaced = s.ws !== null && s.name === name ? s.ws : null;
  s.name = name;
  s.ws = ws;
  return { ok: true, replaced };
}

export function unseat(seats: Seats, ws: WebSocket): Slot | null {
  for (let i = 0; i < seats.length; i++) {
    if (seats[i]!.ws === ws) {
      seats[i]!.ws = null;
      return i as Slot;
    }
  }
  return null;
}

export function allSeated(seats: Seats): boolean {
  return seats.every((s) => s.name !== null);
}

export function namesInSlotOrder(seats: Seats): [string, string, string] {
  return [seats[0]!.name!, seats[1]!.name!, seats[2]!.name!];
}
