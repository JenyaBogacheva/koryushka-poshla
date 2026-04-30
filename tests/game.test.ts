import { describe, it, expect } from 'vitest';
import { Game } from '../server/game';

describe('Game — init', () => {
  it('starts in waiting phase with three empty slots', () => {
    const g = new Game({ seed: 1 });
    const s = g.snapshot();
    expect(s.phase).toBe('waiting');
    expect(s.players.length).toBe(3);
    for (const p of s.players) {
      expect(p.connected).toBe(false);
      expect(p.rack.length).toBe(0);
      expect(p.rackVisible).toBe(true);
      expect(p.score).toBe(0);
    }
    expect(s.bag.length).toBe(104);
    expect(s.turnIndex).toBe(0);
    expect(s.centerBonusUsed).toBe(false);
    expect(s.history).toEqual([]);
  });

  it('joinPlayer assigns name and marks connected', () => {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'Женя');
    const s = g.snapshot();
    expect(s.players[0]!.name).toBe('Женя');
    expect(s.players[0]!.connected).toBe(true);
  });

  it('startGame deals 7 tiles to each player and moves to playing', () => {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    const s = g.snapshot();
    expect(s.phase).toBe('playing');
    expect(s.bag.length).toBe(104 - 21);
    for (const p of s.players) expect(p.rack.length).toBe(7);
  });

  it('refuses to start unless all three slots are joined', () => {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'A');
    expect(() => g.startGame()).toThrow();
  });

  it('snapshot is a deep copy (no shared mutable references)', () => {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    const s1 = g.snapshot();
    s1.players[0]!.score = 999;
    const s2 = g.snapshot();
    expect(s2.players[0]!.score).toBe(0);
  });
});
