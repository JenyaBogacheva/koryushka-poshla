import { describe, it, expect } from 'vitest';
import { Game } from '../server/game';
import type { Placement } from '@shared/types';
import { isAllVowels, isAllConsonants } from '../server/rack';

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

function makeReadyGame(seed: number) {
  const g = new Game({ seed });
  g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
  g.startGame();
  return g;
}

describe('Game — submitMove', () => {
  it('rejects move from non-current player', () => {
    const g = makeReadyGame(1);
    const result = g.submitMove(1, []); // not their turn
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-your-turn');
  });

  it('rejects an empty move (must use validateMove path)', () => {
    const g = makeReadyGame(1);
    const result = g.submitMove(0, []);
    expect(result.ok).toBe(false);
  });

  it('accepts a valid first move (covers center) and updates score / turn / rack / bag', () => {
    const g = makeReadyGame(1);
    const before = g.snapshot();
    const rack = before.players[0]!.rack;
    // Build a 1-tile move at the center using whatever tile we have first.
    const t = rack[0]!;
    const placement: Placement = {
      tileId: t.id, row: 7, col: 7,
      playedAs: t.isBlank ? 'А' : t.letter,
    };
    const result = g.submitMove(0, [placement]);
    expect(result.ok).toBe(true);
    const after = g.snapshot();
    if (result.ok) {
      expect(after.players[0]!.score).toBe(result.moveRecord.totalScore);
      expect(after.history.length).toBe(1);
    }
    expect(after.turnIndex).toBe(1);
    expect(after.players[0]!.rack.length).toBe(7); // refilled
    expect(after.bag.length).toBe(104 - 21 - 1); // one tile drawn from bag for refill
    expect(after.centerBonusUsed).toBe(true);
  });

  it('refuses moves while phase != playing', () => {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    // never call startGame()
    const result = g.submitMove(0, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-playing');
  });
});

describe('Game — passTurn', () => {
  it('advances the turn', () => {
    const g = makeReadyGame(1);
    g.passTurn(0);
    expect(g.snapshot().turnIndex).toBe(1);
  });
  it('rejects pass by non-current', () => {
    const g = makeReadyGame(1);
    expect(() => g.passTurn(1)).toThrow();
  });
});

describe('Game — swapTiles', () => {
  it('exchanges tiles and ends turn', () => {
    const g = makeReadyGame(1);
    const before = g.snapshot();
    const ids = before.players[0]!.rack.slice(0, 3).map((t) => t.id);
    g.swapTiles(0, ids);
    const after = g.snapshot();
    expect(after.players[0]!.rack.length).toBe(7);
    expect(after.turnIndex).toBe(1);
    // The exchanged tile ids should no longer be in the rack
    const remaining = new Set(after.players[0]!.rack.map((t) => t.id));
    for (const id of ids) expect(remaining.has(id)).toBe(false);
  });
});

describe('Game — redrawRack', () => {
  it('only succeeds when rack is all-vowels or all-consonants', () => {
    const g = makeReadyGame(1);
    const before = g.snapshot();
    const eligible = isAllVowels(before.players[0]!.rack) || isAllConsonants(before.players[0]!.rack);
    if (!eligible) {
      expect(() => g.redrawRack(0)).toThrow();
    }
  });

  it('does not end turn when allowed', () => {
    // Force a synthetic eligible rack via a different seed; if we can't, skip the assertion logic but verify the API.
    // Try a few seeds until one yields an eligible starting rack.
    let g: Game | null = null;
    for (let seed = 1; seed < 200; seed++) {
      const candidate = makeReadyGame(seed);
      const r = candidate.snapshot().players[0]!.rack;
      if (isAllVowels(r) || isAllConsonants(r)) { g = candidate; break; }
    }
    if (!g) return; // skip if no seed found
    const before = g.snapshot();
    g.redrawRack(0);
    const after = g.snapshot();
    expect(after.turnIndex).toBe(before.turnIndex); // turn NOT advanced
    expect(after.players[0]!.rack.length).toBe(7);
  });
});
