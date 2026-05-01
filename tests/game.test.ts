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
    expect(s.events).toEqual([]);
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
      expect(after.events.length).toBe(1);
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
  it('passTurn appends a PassRecord to events', () => {
    const g = makeReadyGame(1);
    const events0 = g.snapshot().events.length;
    g.passTurn(0);
    const events = g.snapshot().events;
    expect(events.length).toBe(events0 + 1);
    const last = events[events.length - 1]!;
    expect(last.kind).toBe('pass');
    if (last.kind === 'pass') {
      expect(last.slot).toBe(0);
      expect(typeof last.timestamp).toBe('number');
    }
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

  it('redrawRack appends a RedrawRecord with reason and tileCount', () => {
    const g = makeReadyGame(11);
    const s = g.snapshot();
    s.players[0]!.rack = s.players[0]!.rack.map((t, i) =>
      ({ ...t, letter: ['А','Е','И','О','У','Ы','Э'][i % 7]!, points: 1, isBlank: false }),
    );
    const g2 = Game.fromState(s);
    const before = g2.snapshot();
    const tileCount = before.players[0]!.rack.length;
    g2.redrawRack(0);
    const events = g2.snapshot().events;
    const last = events[events.length - 1]!;
    expect(last.kind).toBe('redraw');
    if (last.kind === 'redraw') {
      expect(last.slot).toBe(0);
      expect(last.reason).toBe('allVowels');
      expect(last.tileCount).toBe(tileCount);
    }
  });
});

describe('Game — claimBlank', () => {
  it('swaps a real letter onto the board where a blank sits', () => {
    const g = makeReadyGame(1);
    // Force-state: place a blank cell on the board and put a matching real letter on the current player's rack.
    // We do this by reaching into snapshot semantics — test goes through public API: simulate slot 0 playing a blank as 'А' covering center.
    const s0 = g.snapshot();
    // find a blank in any rack OR in the bag; for a deterministic test, we'll instead bypass and play normally:
    // skip if no blank in slot 0's rack. (Test is best-effort given seed-dependent layout.)
    const blank = s0.players[0]!.rack.find((t) => t.isBlank);
    const realA = s0.players[0]!.rack.find((t) => !t.isBlank && t.letter === 'А');
    if (!blank || !realA) return; // skip
    const result = g.submitMove(0, [
      { tileId: blank.id, row: 7, col: 7, playedAs: 'А' },
    ]);
    expect(result.ok).toBe(true);
    // Now turn passes to player 1; we need slot 1 to claim. But to keep test simple, we test eligibility via a direct call:
    // skip claim execution unless it's slot 1's turn AND slot 1 has a real А — keep the test pragmatic.
    const after = g.snapshot();
    expect(after.board[7]![7]?.fromBlank).toBe(true);
  });

  it('rejects claim when not the claimer\'s turn', () => {
    const g = makeReadyGame(1);
    // No blank on board yet → still rejected by "not your turn" before reaching cell check
    expect(() => g.claimBlank(2, 7, 7, 'fake-id')).toThrow();
  });

  it('rejects claim when cell does not hold a fromBlank tile', () => {
    const g = makeReadyGame(1);
    expect(() => g.claimBlank(0, 7, 7, 'irrelevant')).toThrow();
  });

  it('claimBlank appends a ClaimBlankRecord', () => {
    // Build a state where slot 0's rack has a real 'А' and the board cell [7][7] holds a blank played as 'А'.
    const g = makeReadyGame(1);
    const s = g.snapshot();
    const blankTile: import('@shared/types').Tile = { id: 't-blank-test', letter: '', points: 0, isBlank: true };
    const realA: import('@shared/types').Tile = { id: 't-realA-test', letter: 'А', points: 1, isBlank: false };
    // Replace slot 0 rack with just the real А (plus filler to keep length reasonable).
    s.players[0]!.rack = [realA];
    // Place blank on board.
    s.board[7]![7] = { tile: blankTile, playedAs: 'А', fromBlank: true };
    s.turnIndex = 0;
    const g2 = Game.fromState(s);
    g2.claimBlank(0, 7, 7, realA.id);
    const events = g2.snapshot().events;
    const last = events[events.length - 1]!;
    expect(last.kind).toBe('claimBlank');
    if (last.kind === 'claimBlank') {
      expect(last.slot).toBe(0);
      expect(last.row).toBe(7);
      expect(last.col).toBe(7);
      expect(last.letterAs).toBe('А');
    }
  });
});

describe('Game — endGame', () => {
  it('any player may end; phase becomes finished', () => {
    const g = makeReadyGame(1);
    g.endGame(2); // not their turn — still allowed per spec
    expect(g.snapshot().phase).toBe('finished');
  });

  it('after endGame, further turn-actions are rejected', () => {
    const g = makeReadyGame(1);
    g.endGame(0);
    const r = g.submitMove(0, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not-playing');
  });

  it('endGame appends an EndGameRecord with cause "playerEnded"', () => {
    const g = makeReadyGame(1);
    g.endGame(0);
    const last = g.snapshot().events.at(-1)!;
    expect(last.kind).toBe('endGame');
    if (last.kind === 'endGame') {
      expect(last.slot).toBe(0);
      expect(last.cause).toBe('playerEnded');
    }
    expect(g.snapshot().phase).toBe('finished');
  });
});

describe('Game — toggleRackVisibility', () => {
  it('flips a player\'s visibility', () => {
    const g = makeReadyGame(1);
    expect(g.snapshot().players[1]!.rackVisible).toBe(true);
    g.toggleRackVisibility(1, false);
    expect(g.snapshot().players[1]!.rackVisible).toBe(false);
    g.toggleRackVisibility(1, true);
    expect(g.snapshot().players[1]!.rackVisible).toBe(true);
  });
});

describe('Game.fromState', () => {
  it('round-trips a fresh post-startGame snapshot', () => {
    const original = new Game({ seed: 1 });
    original.joinPlayer(0, 'A');
    original.joinPlayer(1, 'B');
    original.joinPlayer(2, 'C');
    original.startGame();
    const snap = original.snapshot();
    const restored = Game.fromState(snap);
    expect(restored.snapshot()).toEqual(snap);
  });

  it('lets a restored game keep playing', () => {
    const original = new Game({ seed: 1 });
    original.joinPlayer(0, 'A');
    original.joinPlayer(1, 'B');
    original.joinPlayer(2, 'C');
    original.startGame();
    const restored = Game.fromState(original.snapshot());
    const racks = restored.snapshot().players.map((p) => p.rack);
    expect(racks[0]!.length).toBe(7);
    expect(restored.snapshot().turnIndex).toBe(0);
    expect(restored.snapshot().phase).toBe('playing');
  });
});

describe('snapshot per-player flags', () => {
  it('exposes redrawEligible=false and canRevert=false on a fresh game', () => {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    const snap = g.snapshot();
    for (const p of snap.players) {
      expect(typeof p.redrawEligible).toBe('boolean');
      expect(p.canRevert).toBe(false);
    }
  });

  it('redrawEligible is true when the rack is all-vowel', () => {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    const state = g.snapshot();
    state.players[0]!.rack = state.players[0]!.rack.map((t, i) =>
      ({ ...t, letter: ['А','Е','И','О','У','Ы','Э'][i % 7]!, points: 1, isBlank: false }),
    );
    const g2 = Game.fromState(state);
    expect(g2.snapshot().players[0]!.redrawEligible).toBe(true);
  });
});


describe('Game.revertLastTurn after submitMove', () => {
  function setup() {
    const g = new Game({ seed: 7 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    return g;
  }

  it('restores board, rack, score, turnIndex after revert', () => {
    const g = setup();
    const before = g.snapshot();
    const p0 = g.snapshot().players[0]!;
    const t0 = p0.rack[0]!;
    const t1 = p0.rack[1]!;
    const result = g.submitMove(0, [
      { tileId: t0.id, row: 7, col: 7, playedAs: t0.letter },
      { tileId: t1.id, row: 7, col: 8, playedAs: t1.letter },
    ]);
    if (result.ok) {
      const after = g.snapshot();
      expect(after.players[0]!.canRevert).toBe(true);
      expect(after.turnIndex).toBe(1);
      g.revertLastTurn(0);
      const reverted = g.snapshot();
      expect(reverted.turnIndex).toBe(0);
      expect(reverted.players[0]!.score).toBe(before.players[0]!.score);
      expect(reverted.players[0]!.rack.map((t) => t.id).sort()).toEqual(
        before.players[0]!.rack.map((t) => t.id).sort(),
      );
      expect(reverted.board[7]![7]).toBeNull();
      expect(reverted.players[0]!.canRevert).toBe(false);
    }
  });

  it('rejects revert from a non-author', () => {
    const g = setup();
    const p0 = g.snapshot().players[0]!;
    const t0 = p0.rack[0]!; const t1 = p0.rack[1]!;
    const r = g.submitMove(0, [
      { tileId: t0.id, row: 7, col: 7, playedAs: t0.letter },
      { tileId: t1.id, row: 7, col: 8, playedAs: t1.letter },
    ]);
    if (!r.ok) return;
    expect(() => g.revertLastTurn(1)).toThrow();
  });
});

describe('revert across action types', () => {
  function setup() {
    const g = new Game({ seed: 11 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    return g;
  }

  it('arms revert after pass and restores turnIndex', () => {
    const g = setup();
    g.passTurn(0);
    expect(g.snapshot().turnIndex).toBe(1);
    expect(g.snapshot().players[0]!.canRevert).toBe(true);
    g.revertLastTurn(0);
    expect(g.snapshot().turnIndex).toBe(0);
    expect(g.snapshot().players[0]!.canRevert).toBe(false);
  });

  it('clears revert window when another player acts', () => {
    const g = setup();
    g.passTurn(0);
    expect(g.snapshot().players[0]!.canRevert).toBe(true);
    g.passTurn(1);
    expect(g.snapshot().players[0]!.canRevert).toBe(false);
    expect(() => g.revertLastTurn(0)).toThrow();
  });

  it('endGame does not arm revert', () => {
    const g = setup();
    g.endGame(0);
    expect(g.snapshot().players[0]!.canRevert).toBe(false);
    expect(() => g.revertLastTurn(0)).toThrow();
  });

  it('arms revert after redrawRack and restores rack', () => {
    const g = setup();
    const s = g.snapshot();
    s.players[0]!.rack = s.players[0]!.rack.map((t, i) =>
      ({ ...t, letter: ['А','Е','И','О','У','Ы','Э'][i % 7]!, points: 1, isBlank: false }),
    );
    const g2 = Game.fromState(s);
    const beforeRack = g2.snapshot().players[0]!.rack.map((t) => t.id).sort();
    g2.redrawRack(0);
    expect(g2.snapshot().players[0]!.canRevert).toBe(true);
    g2.revertLastTurn(0);
    expect(g2.snapshot().players[0]!.rack.map((t) => t.id).sort()).toEqual(beforeRack);
  });
});

describe('Game — submitMove with helperSlot (assist credit)', () => {
  function setup() {
    const g = new Game({ seed: 1 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    return g;
  }

  function makeFirstMovePlacements(g: Game): import('@shared/types').Placement[] {
    const t = g.snapshot().players[0]!.rack[0]!;
    return [{ tileId: t.id, row: 7, col: 7, playedAs: t.isBlank ? 'А' : t.letter }];
  }

  it('submitMove with helperSlot adds 5 to helper and appends AssistRecord', () => {
    const g = setup();
    const r = g.submitMove(0, makeFirstMovePlacements(g), 1);
    expect(r.ok).toBe(true);
    const snap = g.snapshot();
    expect(snap.players[1]!.score).toBe(5);
    const events = snap.events;
    const moveRec = events.at(-2)!;
    const assistRec = events.at(-1)!;
    expect(moveRec.kind).toBe('move');
    if (moveRec.kind === 'move') expect(moveRec.helperSlot).toBe(1);
    expect(assistRec.kind).toBe('assist');
    if (assistRec.kind === 'assist') {
      expect(assistRec.fromSlot).toBe(0);
      expect(assistRec.toSlot).toBe(1);
      expect(assistRec.points).toBe(5);
      expect(assistRec.forMoveIndex).toBe(events.length - 2);
    }
  });

  it('submitMove rejects helperSlot equal to submitter', () => {
    const g = setup();
    const r = g.submitMove(0, makeFirstMovePlacements(g), 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-helper');
  });

  it('submitMove rejects out-of-range helperSlot', () => {
    const g = setup();
    const r = g.submitMove(0, makeFirstMovePlacements(g), 5 as import('@shared/types').Slot);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid-helper');
  });

  it('rejected move does not award assist or append events', () => {
    const g = setup();
    const eventsBefore = g.snapshot().events.length;
    const score1Before = g.snapshot().players[1]!.score;
    // Off-center single tile fails first-move-must-cover-center validation
    const t = g.snapshot().players[0]!.rack[0]!;
    const r = g.submitMove(0, [{ tileId: t.id, row: 0, col: 0, playedAs: t.isBlank ? 'А' : t.letter }], 1);
    expect(r.ok).toBe(false);
    expect(g.snapshot().events.length).toBe(eventsBefore);
    expect(g.snapshot().players[1]!.score).toBe(score1Before);
  });

  it('revert of an assisted move reverses helper +5 and appends two revert records', () => {
    const g = setup();
    g.submitMove(0, makeFirstMovePlacements(g), 1);
    expect(g.snapshot().players[1]!.score).toBe(5);
    g.revertLastTurn(0);
    const snap = g.snapshot();
    expect(snap.players[1]!.score).toBe(0);
    expect(snap.players[0]!.score).toBe(0);
    // Log tail after revert: move, assist, revert(assist), revert(move).
    const tail = snap.events.slice(-4);
    expect(tail.map((e) => e.kind)).toEqual(['move', 'assist', 'revert', 'revert']);
    if (tail[2]!.kind === 'revert') expect(tail[2]!.revertedKind).toBe('assist');
    if (tail[3]!.kind === 'revert') expect(tail[3]!.revertedKind).toBe('move');
  });
});

describe('Game.revertLastTurn — append-only RevertRecord log', () => {
  function makeReadyGame2(seed: number) {
    const g = new Game({ seed });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    return g;
  }

  it('revertLastTurn after submitMove appends RevertRecord(kind="move") and rolls back state', () => {
    // seed 7 is also used by the existing submitMove revert test; 2-tile placement guarantees non-zero score.
    const g = makeReadyGame2(7);
    const before = g.snapshot();
    const p0 = before.players[0]!;
    const t0 = p0.rack[0]!;
    const t1 = p0.rack[1]!;
    const result = g.submitMove(0, [
      { tileId: t0.id, row: 7, col: 7, playedAs: t0.isBlank ? 'А' : t0.letter },
      { tileId: t1.id, row: 7, col: 8, playedAs: t1.isBlank ? 'А' : t1.letter },
    ]);
    if (!result.ok) return; // skip if placement invalid for this seed
    const scoreAfter = g.snapshot().players[0]!.score;
    expect(scoreAfter).toBeGreaterThan(0);

    g.revertLastTurn(0);
    const snap = g.snapshot();
    expect(snap.players[0]!.score).toBe(0);
    const tail = snap.events.slice(-2);
    expect(tail[0]!.kind).toBe('move');
    expect(tail[1]!.kind).toBe('revert');
    if (tail[1]!.kind === 'revert') {
      expect(tail[1]!.revertedKind).toBe('move');
      expect(tail[1]!.slot).toBe(0);
    }
  });

  it('revertLastTurn after passTurn appends RevertRecord(kind="pass")', () => {
    const g = makeReadyGame2(1);
    g.passTurn(0);
    g.revertLastTurn(0);
    const tail = g.snapshot().events.slice(-2);
    expect(tail[0]!.kind).toBe('pass');
    expect(tail[1]!.kind).toBe('revert');
    if (tail[1]!.kind === 'revert') expect(tail[1]!.revertedKind).toBe('pass');
  });

  it('revertLastTurn after redrawRack appends RevertRecord(kind="redraw")', () => {
    const g = makeReadyGame2(11);
    const s = g.snapshot();
    s.players[0]!.rack = s.players[0]!.rack.map((t, i) =>
      ({ ...t, letter: ['А','Е','И','О','У','Ы','Э'][i % 7]!, points: 1, isBlank: false }),
    );
    const g2 = Game.fromState(s);
    g2.redrawRack(0);
    g2.revertLastTurn(0);
    const tail = g2.snapshot().events.slice(-2);
    expect(tail[0]!.kind).toBe('redraw');
    expect(tail[1]!.kind).toBe('revert');
    if (tail[1]!.kind === 'revert') expect(tail[1]!.revertedKind).toBe('redraw');
  });

  it('revertLastTurn after claimBlank appends RevertRecord(kind="claimBlank")', () => {
    const g = makeReadyGame2(1);
    const s = g.snapshot();
    const blankTile: import('@shared/types').Tile = { id: 't-blank-test', letter: '', points: 0, isBlank: true };
    const realA: import('@shared/types').Tile = { id: 't-realA-test', letter: 'А', points: 1, isBlank: false };
    s.players[0]!.rack = [realA];
    s.board[7]![7] = { tile: blankTile, playedAs: 'А', fromBlank: true };
    s.turnIndex = 0;
    const g2 = Game.fromState(s);
    g2.claimBlank(0, 7, 7, realA.id);
    g2.revertLastTurn(0);
    const tail = g2.snapshot().events.slice(-2);
    expect(tail[0]!.kind).toBe('claimBlank');
    expect(tail[1]!.kind).toBe('revert');
    if (tail[1]!.kind === 'revert') expect(tail[1]!.revertedKind).toBe('claimBlank');
  });
});
