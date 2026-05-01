import { describe, it, expect } from 'vitest';
import { createSeats, seat, unseat, allSeated, namesInSlotOrder } from '../server/connections';

const fakeWs = (id: string) => ({ id }) as any;

describe('connections — seating', () => {
  it('starts with three empty seats', () => {
    const s = createSeats();
    expect(s[0]).toEqual({ ws: null, name: null });
    expect(s[1]).toEqual({ ws: null, name: null });
    expect(s[2]).toEqual({ ws: null, name: null });
    expect(allSeated(s)).toBe(false);
  });

  it('seats an empty slot', () => {
    const s = createSeats();
    const ws = fakeWs('a');
    const r = seat(s, 0, 'Alice', ws);
    expect(r).toEqual({ ok: true, replaced: null });
    expect(s[0]).toEqual({ ws, name: 'Alice' });
  });

  it('rejects a different name on a seat held by a live socket', () => {
    const s = createSeats();
    seat(s, 0, 'Alice', fakeWs('a'));
    const r = seat(s, 0, 'Bob', fakeWs('b'));
    expect(r).toEqual({ ok: false, reason: 'Slot taken' });
  });

  it('takes over a live socket of the same name (returns replaced and swaps the ws)', () => {
    const s = createSeats();
    const wsA = fakeWs('a');
    const wsA2 = fakeWs('a2');
    seat(s, 0, 'Alice', wsA);
    const r = seat(s, 0, 'Alice', wsA2);
    expect(r).toEqual({ ok: true, replaced: wsA });
    expect(s[0]!.ws).toBe(wsA2);
    expect(s[0]!.name).toBe('Alice');
  });

  it('allows reconnect by same name when previous socket is gone', () => {
    const s = createSeats();
    const wsA = fakeWs('a');
    seat(s, 0, 'Alice', wsA);
    unseat(s, wsA);
    expect(s[0]).toEqual({ ws: null, name: 'Alice' });
    const r = seat(s, 0, 'Alice', fakeWs('a2'));
    expect(r).toEqual({ ok: true, replaced: null });
    expect(s[0]!.name).toBe('Alice');
  });

  it('rejects different name on a previously-seated slot even after disconnect', () => {
    const s = createSeats();
    const wsA = fakeWs('a');
    seat(s, 0, 'Alice', wsA);
    unseat(s, wsA);
    const r = seat(s, 0, 'Bob', fakeWs('b'));
    expect(r).toEqual({ ok: false, reason: 'Slot taken' });
  });

  it('allSeated is true when all three slots have a name', () => {
    const s = createSeats();
    seat(s, 0, 'A', fakeWs('a'));
    seat(s, 1, 'B', fakeWs('b'));
    expect(allSeated(s)).toBe(false);
    seat(s, 2, 'C', fakeWs('c'));
    expect(allSeated(s)).toBe(true);
  });

  it('unseat by ws clears only the matching ws', () => {
    const s = createSeats();
    const wsA = fakeWs('a');
    const wsB = fakeWs('b');
    seat(s, 0, 'A', wsA);
    seat(s, 1, 'B', wsB);
    unseat(s, wsA);
    expect(s[0]!.ws).toBeNull();
    expect(s[1]!.ws).toBe(wsB);
  });

  it('namesInSlotOrder returns names in slot order', () => {
    const s = createSeats();
    seat(s, 0, 'A', fakeWs('a'));
    seat(s, 1, 'B', fakeWs('b'));
    seat(s, 2, 'C', fakeWs('c'));
    expect(namesInSlotOrder(s)).toEqual(['A', 'B', 'C']);
  });
});
