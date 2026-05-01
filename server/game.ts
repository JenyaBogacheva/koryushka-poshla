import type { GameState, Player, Slot, Tile, Placement, MoveRecord, WordFormed, GameEvent, Letter } from '@shared/types';
import { createBag, drawTiles, returnTiles, makeRng, bagFromTiles, type Bag } from './bag.js';
import { addTilesToRack, removeTilesFromRack, redrawEligible, isAllVowels } from './rack.js';
import { createEmptyBoard, applyPlacements, isEmpty, extractWordsFormed } from './board.js';
import { validateMove, type MoveError } from './moves.js';
import { scoreMove } from './scoring.js';
import { checkWords } from './dictionary.js';
import { compareLetterOrder } from './letters.js';

export type GameOpts = { seed: number };

export type SubmitResult =
  | { ok: true; moveRecord: MoveRecord; dictionaryWarnings: string[] }
  | { ok: false; error: MoveError | { kind: 'not-your-turn' } | { kind: 'not-playing' } | { kind: 'invalid-helper' } };

export class Game {
  private state: GameState;
  private bag: Bag;
  // Single-level undo. Captured pre-mutation by submitMove/passTurn/redrawRack/claimBlank.
  // Cleared the moment a different slot acts. Not persisted to disk.
  private lastSnapshot: { state: GameState; bySlot: Slot } | null = null;
  // Records appended by the most recent action, kept so revert can preserve
  // them in the log even after restoring `state` from `lastSnapshot`.
  private lastActionRecords: GameEvent[] | null = null;

  constructor(opts: GameOpts) {
    this.bag = createBag(makeRng(opts.seed));
    const players: [Player, Player, Player] = [0, 1, 2].map((slot) => ({
      slot: slot as Slot,
      name: '',
      connected: false,
      rack: [] as Tile[],
      rackVisible: true,
      score: 0,
      redrawEligible: false,
      canRevert: false,
    })) as [Player, Player, Player];
    this.state = {
      phase: 'waiting',
      players,
      turnIndex: 0,
      board: createEmptyBoard(),
      bag: this.bag.tiles,
      centerBonusUsed: false,
      events: [],
      startedAt: null,
    };
  }

  static fromState(state: GameState): Game {
    const g = Object.create(Game.prototype) as Game;
    const cloned = structuredClone(state);
    const bag = bagFromTiles(cloned.bag, makeRng(Date.now()));
    cloned.bag = bag.tiles;
    type Mutable = { bag: Bag; state: GameState; lastSnapshot: null; lastActionRecords: null };
    (g as unknown as Mutable).bag = bag;
    (g as unknown as Mutable).state = cloned;
    (g as unknown as Mutable).lastSnapshot = null;
    (g as unknown as Mutable).lastActionRecords = null;
    return g;
  }

  joinPlayer(slot: Slot, name: string): void {
    const p = this.state.players[slot]!;
    p.name = name;
    p.connected = true;
  }

  startGame(): void {
    if (!this.state.players.every((p) => p.connected)) {
      throw new Error('Cannot start until all three slots are connected');
    }

    let candidates: Slot[] = [0, 1, 2];
    let firstDraws: { slot: Slot; letter: Letter | null }[] = [];
    let firstSlot: Slot;
    while (true) {
      const drawn = candidates.map((s) => {
        const tile = drawTiles(this.bag, 1)[0]!;
        return { slot: s, tile, letter: tile.isBlank ? null : tile.letter };
      });
      if (firstDraws.length === 0) {
        // The first snapshot is captured before any tie-redraw, so the event reflects the initial three-way draw.
        firstDraws = drawn.map((d) => ({ slot: d.slot, letter: d.letter }));
      }
      drawn.sort((a, b) => compareLetterOrder(a.letter, b.letter));
      const best = drawn[0]!;
      const tied = drawn.filter((d) => compareLetterOrder(d.letter, best.letter) === 0);
      returnTiles(this.bag, drawn.map((d) => d.tile));
      if (tied.length === 1) {
        firstSlot = best.slot;
        break;
      }
      candidates = tied.map((d) => d.slot);
    }

    for (const p of this.state.players) {
      const drawn = drawTiles(this.bag, 7);
      addTilesToRack(p.rack, drawn);
    }

    this.state.events.push({
      kind: 'drawForOrder',
      draws: firstDraws,
      firstSlot,
      timestamp: Date.now(),
    });
    this.state.turnIndex = firstSlot;
    this.state.phase = 'playing';
    this.state.bag = this.bag.tiles;
    this.state.startedAt = Date.now();
  }

  submitMove(slot: Slot, placements: Placement[], helperSlot?: Slot): SubmitResult {
    if (this.state.phase !== 'playing') return { ok: false, error: { kind: 'not-playing' } };
    if (slot !== this.state.turnIndex) return { ok: false, error: { kind: 'not-your-turn' } };

    if (helperSlot !== undefined) {
      if (helperSlot !== 0 && helperSlot !== 1 && helperSlot !== 2) {
        return { ok: false, error: { kind: 'invalid-helper' } };
      }
      if (helperSlot === slot) {
        return { ok: false, error: { kind: 'invalid-helper' } };
      }
    }

    const player = this.state.players[slot]!;

    const isFirst = isEmpty(this.state.board);
    const validation = validateMove(this.state.board, player.rack, placements, isFirst);
    if (!validation.ok) return { ok: false, error: validation.error };

    this.maybeClearRevertOnActionBy(slot);
    const preStateForRevert = structuredClone(this.state);

    // Pull the tiles being placed off the rack (we need actual Tile objects to apply).
    const tileIds = placements.map((p) => p.tileId);
    const placedTiles = removeTilesFromRack(player.rack, tileIds);

    applyPlacements(this.state.board, placements, placedTiles);
    const words = extractWordsFormed(this.state.board, placements);
    const score = scoreMove(this.state.board, words, placements, { centerBonusUsed: this.state.centerBonusUsed });

    player.score += score.totalScore;
    if (score.centerNowUsed) this.state.centerBonusUsed = true;

    // Refill rack from bag.
    const drawn = drawTiles(this.bag, placements.length);
    addTilesToRack(player.rack, drawn);
    this.state.bag = this.bag.tiles;

    const dictionaryWarnings = checkWords(words.map((w) => w.word));
    const moveRecord: MoveRecord = {
      kind: 'move',
      slot,
      placements,
      wordsFormed: score.perWord.map<WordFormed>((w) => ({
        word: w.word, cells: w.cells, score: w.score,
      })),
      totalScore: score.totalScore,
      bingoBonus: score.bingoBonus,
      helperSlot: helperSlot ?? null,
      dictionaryWarnings,
      timestamp: Date.now(),
    };
    const startLen = this.state.events.length;
    const moveIndex = this.state.events.length;
    this.state.events.push(moveRecord);

    if (helperSlot !== undefined) {
      this.state.players[helperSlot]!.score += 5;
      this.state.events.push({
        kind: 'assist',
        fromSlot: slot,
        toSlot: helperSlot,
        points: 5,
        forMoveIndex: moveIndex,
        timestamp: Date.now(),
      });
    }

    this.state.turnIndex = ((slot + 1) % 3) as Slot;

    const appended = this.state.events.slice(startLen);
    this.armRevert(slot, preStateForRevert, appended);
    return { ok: true, moveRecord, dictionaryWarnings };
  }

  snapshot(): GameState {
    const cloned = structuredClone(this.state);
    for (const p of cloned.players) {
      p.redrawEligible = redrawEligible(p.rack);
      p.canRevert = this.lastSnapshot !== null && this.lastSnapshot.bySlot === p.slot;
    }
    return cloned;
  }

  passTurn(slot: Slot): void {
    this.assertTurn(slot);
    this.maybeClearRevertOnActionBy(slot);
    const pre = structuredClone(this.state);
    const startLen = this.state.events.length;
    this.state.turnIndex = ((slot + 1) % 3) as Slot;
    this.state.events.push({ kind: 'pass', slot, timestamp: Date.now() });
    const appended = this.state.events.slice(startLen);
    this.armRevert(slot, pre, appended);
  }

  redrawRack(slot: Slot): void {
    this.assertTurn(slot);
    const player = this.state.players[slot]!;
    if (!redrawEligible(player.rack)) {
      throw new Error('Rack is not eligible for free redraw (must be all vowels or all consonants)');
    }
    const reason: 'allVowels' | 'allConsonants' =
      isAllVowels(player.rack) ? 'allVowels' : 'allConsonants';
    const tileCount = player.rack.length;
    this.maybeClearRevertOnActionBy(slot);
    const pre = structuredClone(this.state);
    const startLen = this.state.events.length;
    const allIds = player.rack.map((t) => t.id);
    const removed = removeTilesFromRack(player.rack, allIds);
    returnTiles(this.bag, removed);
    const drawn = drawTiles(this.bag, 7);
    addTilesToRack(player.rack, drawn);
    this.state.bag = this.bag.tiles;
    // turn not advanced
    this.state.events.push({ kind: 'redraw', slot, reason, tileCount, timestamp: Date.now() });
    const appended = this.state.events.slice(startLen);
    this.armRevert(slot, pre, appended);
  }

  /**
   * Swap a real letter from `slot`'s rack onto a board cell holding a blank with the matching playedAs.
   * On success, the blank moves to `slot`'s rack. Allowed on the claimer's own turn, before submitMove.
   */
  claimBlank(slot: Slot, row: number, col: number, myTileId: string): void {
    this.assertTurn(slot);
    const cell = this.state.board[row]?.[col];
    if (!cell || !cell.fromBlank) throw new Error('Cell does not hold a blank');
    const player = this.state.players[slot]!;
    const idx = player.rack.findIndex((t) => t.id === myTileId);
    if (idx === -1) throw new Error('Tile not in rack');
    const real = player.rack[idx]!;
    if (real.isBlank) throw new Error('Cannot claim with another blank');
    if (real.letter !== cell.playedAs) {
      throw new Error(`Tile letter ${real.letter} does not match blank's playedAs ${cell.playedAs}`);
    }
    this.maybeClearRevertOnActionBy(slot);
    const pre = structuredClone(this.state);
    const startLen = this.state.events.length;
    // Perform swap.
    const blank = cell.tile;
    player.rack.splice(idx, 1);
    player.rack.push(blank);
    this.state.board[row]![col] = {
      tile: real,
      playedAs: cell.playedAs,
      fromBlank: false,
    };
    this.state.events.push({
      kind: 'claimBlank',
      slot,
      row,
      col,
      letterAs: cell.playedAs,
      timestamp: Date.now(),
    });
    const appended = this.state.events.slice(startLen);
    this.armRevert(slot, pre, appended);
  }

  endGame(slot: Slot): void {
    if (this.state.phase !== 'playing') return; // idempotent if already finished
    this.maybeClearRevertOnActionBy(slot);
    this.lastSnapshot = null; // ending the game finalizes everything
    this.state.phase = 'finished';
    this.state.events.push({
      kind: 'endGame',
      slot,
      cause: 'playerEnded',
      timestamp: Date.now(),
    });
  }

  revertLastTurn(slot: Slot): void {
    if (this.lastSnapshot === null) throw new Error('Nothing to revert');
    if (this.lastSnapshot.bySlot !== slot) throw new Error('Only the action author can revert');
    const restored = this.lastSnapshot.state;
    const appended = this.lastActionRecords ?? [];

    // Roll game state back to the pre-action snapshot.
    this.state = restored;
    // Keep the existing seeded rng closure; rewind the bag's tile array to the restored state.
    this.bag.tiles = [...this.state.bag];
    this.state.bag = this.bag.tiles;

    // Re-attach the original action records so the log shows what happened…
    for (const rec of appended) this.state.events.push(rec);

    // …and append matching revert records in reverse order
    // (so an AssistRecord pushed AFTER a MoveRecord is reverted FIRST).
    const ts = Date.now();
    for (let i = appended.length - 1; i >= 0; i--) {
      this.state.events.push({
        kind: 'revert',
        slot,
        revertedKind: appended[i]!.kind,
        timestamp: ts,
      });
    }

    this.lastSnapshot = null;
    this.lastActionRecords = null;
  }

  private armRevert(slot: Slot, preState: GameState, appended: GameEvent[]): void {
    this.lastSnapshot = { state: preState, bySlot: slot };
    this.lastActionRecords = appended;
  }

  private maybeClearRevertOnActionBy(slot: Slot): void {
    if (this.lastSnapshot !== null && this.lastSnapshot.bySlot !== slot) {
      this.lastSnapshot = null;
      this.lastActionRecords = null;
    }
  }

  toggleRackVisibility(slot: Slot, visible: boolean): void {
    this.state.players[slot]!.rackVisible = visible;
  }

  private assertTurn(slot: Slot): void {
    if (this.state.phase !== 'playing') throw new Error('Game is not in playing phase');
    if (slot !== this.state.turnIndex) throw new Error(`Not slot ${slot}'s turn`);
  }
}
