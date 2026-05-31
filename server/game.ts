import type { GameState, Player, Slot, Tile, Placement, MoveRecord, WordFormed, Letter } from '@shared/types';
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
  | { ok: false; error: MoveError | { kind: 'not-your-turn' } | { kind: 'not-playing' } };

export type PreviewResult =
  | {
      ok: true;
      totalScore: number;
      bingoBonus: boolean;
      wordsFormed: WordFormed[];
      dictionaryWarnings: string[];
    }
  | { ok: false; error: MoveError | { kind: 'not-your-turn' } | { kind: 'not-playing' } };

export class Game {
  private state: GameState;
  private bag: Bag;
  // Single-level undo. Captured pre-mutation by submitMove/passTurn/redrawRack/claimBlank.
  // Cleared the moment a different slot acts. Not persisted to disk.
  private lastSnapshot: { state: GameState; bySlot: Slot } | null = null;
  // Round-1 draw snapshot: captured the moment all three candidates have drawn,
  // so the eventual DrawForOrderRecord reflects the initial three-way draw rather
  // than the tiebreak round(s).
  private initialDrawSnapshot: { slot: Slot; letter: Letter | null }[] | null = null;

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
      turnOrder: [0, 1, 2],
      board: createEmptyBoard(),
      bag: this.bag.tiles,
      centerBonusUsed: false,
      events: [],
      startedAt: null,
      drawState: null,
    };
  }

  static fromState(state: GameState): Game {
    const g = Object.create(Game.prototype) as Game;
    const cloned = structuredClone(state);
    // Games persisted before turn-order-by-draw lack turnOrder; default to seat order.
    if ((cloned as { turnOrder?: unknown }).turnOrder === undefined) {
      cloned.turnOrder = [0, 1, 2];
    }
    const bag = bagFromTiles(cloned.bag, makeRng(Date.now()));
    cloned.bag = bag.tiles;
    type Mutable = {
      bag: Bag;
      state: GameState;
      lastSnapshot: null;
      initialDrawSnapshot: null;
    };
    (g as unknown as Mutable).bag = bag;
    (g as unknown as Mutable).state = cloned;
    (g as unknown as Mutable).lastSnapshot = null;
    (g as unknown as Mutable).initialDrawSnapshot = null;
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
    this.state.phase = 'drawing';
    this.state.drawState = { round: 1, candidates: [0, 1, 2], draws: [], rankedTop: [], rankedBottom: [] };
    this.initialDrawSnapshot = null;
  }

  drawForOrderTile(slot: Slot): void {
    if (this.state.phase !== 'drawing' || this.state.drawState === null) {
      throw new Error('Game is not in drawing phase');
    }
    const ds = this.state.drawState;
    if (!ds.candidates.includes(slot)) {
      throw new Error(`Slot ${slot} is not a draw candidate`);
    }
    if (ds.draws.some((d) => d.slot === slot)) {
      throw new Error(`Slot ${slot} has already drawn this round`);
    }
    const tile = drawTiles(this.bag, 1)[0]!;
    const letter: Letter | null = tile.isBlank ? null : tile.letter;
    ds.draws.push({ slot, letter });
    returnTiles(this.bag, [tile]);
    this.state.bag = this.bag.tiles;

    if (ds.round === 1 && ds.draws.length === ds.candidates.length && this.initialDrawSnapshot === null) {
      this.initialDrawSnapshot = ds.draws.map((d) => ({ slot: d.slot, letter: d.letter }));
    }

    if (ds.draws.length < ds.candidates.length) return;
    this.resolveDrawRound();
  }

  private resolveDrawRound(): void {
    const ds = this.state.drawState!;
    const sorted = [...ds.draws].sort((a, b) => compareLetterOrder(a.letter, b.letter));

    // Group the candidates' draws into maximal equal-letter tiers, in rank order.
    const tiers: { slot: Slot; letter: Letter | null }[][] = [];
    for (const d of sorted) {
      const last = tiers[tiers.length - 1];
      if (last && compareLetterOrder(last[0]!.letter, d.letter) === 0) last.push(d);
      else tiers.push([d]);
    }

    // Singleton tiers are settled. With ≤3 players at most one tier can hold a tie.
    const tieIndex = tiers.findIndex((t) => t.length > 1);

    if (tieIndex === -1) {
      const order = [
        ...ds.rankedTop,
        ...sorted.map((d) => d.slot),
        ...ds.rankedBottom,
      ] as [Slot, Slot, Slot];
      this.finalizeDraw(order);
      return;
    }

    // Fix the tiers above/below the tie; only the tied slots draw again next round.
    const above = tiers.slice(0, tieIndex).flat().map((d) => d.slot);
    const below = tiers.slice(tieIndex + 1).flat().map((d) => d.slot);
    this.state.drawState = {
      round: ds.round + 1,
      candidates: tiers[tieIndex]!.map((d) => d.slot),
      draws: [],
      rankedTop: [...ds.rankedTop, ...above],
      rankedBottom: [...below, ...ds.rankedBottom],
    };
  }

  private finalizeDraw(order: [Slot, Slot, Slot]): void {
    for (const p of this.state.players) {
      const drawn = drawTiles(this.bag, 7);
      addTilesToRack(p.rack, drawn);
    }
    this.state.events.push({
      kind: 'drawForOrder',
      draws: this.initialDrawSnapshot ?? [],
      order,
      timestamp: Date.now(),
    });
    this.state.turnOrder = order;
    this.state.turnIndex = order[0];
    this.state.phase = 'playing';
    this.state.bag = this.bag.tiles;
    this.state.startedAt = Date.now();
    this.state.drawState = null;
    this.initialDrawSnapshot = null;
  }

  /** Next slot in the draw-decided play order (wraps around). */
  private nextSlot(slot: Slot): Slot {
    const order = this.state.turnOrder;
    return order[(order.indexOf(slot) + 1) % order.length]!;
  }

  submitMove(slot: Slot, placements: Placement[]): SubmitResult {
    if (this.state.phase !== 'playing') return { ok: false, error: { kind: 'not-playing' } };
    if (slot !== this.state.turnIndex) return { ok: false, error: { kind: 'not-your-turn' } };

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
      helperSlot: null,
      dictionaryWarnings,
      timestamp: Date.now(),
    };
    this.state.events.push(moveRecord);

    this.state.turnIndex = this.nextSlot(slot);

    this.armRevert(slot, preStateForRevert);
    return { ok: true, moveRecord, dictionaryWarnings };
  }

  giveAssist(toSlot: Slot): { ok: true } | { ok: false; error: { kind: 'not-playing' } | { kind: 'invalid-helper' } } {
    if (this.state.phase !== 'playing') return { ok: false, error: { kind: 'not-playing' } };
    if (toSlot !== 0 && toSlot !== 1 && toSlot !== 2) return { ok: false, error: { kind: 'invalid-helper' } };
    this.state.players[toSlot]!.score += 5;
    this.state.events.push({ kind: 'assist', helperSlot: toSlot, points: 5, timestamp: Date.now() });
    return { ok: true };
  }

  previewMove(slot: Slot, placements: Placement[]): PreviewResult {
    if (this.state.phase !== 'playing') return { ok: false, error: { kind: 'not-playing' } };
    if (slot !== this.state.turnIndex) return { ok: false, error: { kind: 'not-your-turn' } };

    const player = this.state.players[slot]!;
    const isFirst = isEmpty(this.state.board);
    const validation = validateMove(this.state.board, player.rack, placements, isFirst);
    if (!validation.ok) return { ok: false, error: validation.error };

    const tileIds = placements.map((p) => p.tileId);
    const previewRack = structuredClone(player.rack);
    const placedTiles = removeTilesFromRack(previewRack, tileIds);
    const previewBoard = structuredClone(this.state.board);
    applyPlacements(previewBoard, placements, placedTiles);
    const words = extractWordsFormed(previewBoard, placements);
    const score = scoreMove(previewBoard, words, placements, { centerBonusUsed: this.state.centerBonusUsed });
    const dictionaryWarnings = checkWords(words.map((w) => w.word));

    return {
      ok: true,
      totalScore: score.totalScore,
      bingoBonus: score.bingoBonus,
      wordsFormed: score.perWord.map<WordFormed>((w) => ({ word: w.word, cells: w.cells, score: w.score })),
      dictionaryWarnings,
    };
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
    this.state.turnIndex = this.nextSlot(slot);
    this.state.events.push({ kind: 'pass', slot, timestamp: Date.now() });
    this.armRevert(slot, pre);
  }

  /**
   * Trade in all 7 tiles for new ones from the bag and pass the turn.
   * Unlike redrawRack (free swap on all-vowel / all-consonant racks), this
   * always advances the turn — the player gives up their move to refresh.
   */
  swapAllAndPass(slot: Slot): void {
    this.assertTurn(slot);
    const player = this.state.players[slot]!;
    if (this.bag.tiles.length === 0) {
      throw new Error('Bag is empty — cannot swap');
    }
    const tileCount = player.rack.length;
    this.maybeClearRevertOnActionBy(slot);
    const pre = structuredClone(this.state);
    const allIds = player.rack.map((t) => t.id);
    const removed = removeTilesFromRack(player.rack, allIds);
    returnTiles(this.bag, removed);
    const drawn = drawTiles(this.bag, tileCount);
    addTilesToRack(player.rack, drawn);
    this.state.bag = this.bag.tiles;
    this.state.turnIndex = this.nextSlot(slot);
    this.state.events.push({ kind: 'redraw', slot, reason: 'swapAll', tileCount, timestamp: Date.now() });
    this.armRevert(slot, pre);
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
    const allIds = player.rack.map((t) => t.id);
    const removed = removeTilesFromRack(player.rack, allIds);
    returnTiles(this.bag, removed);
    const drawn = drawTiles(this.bag, 7);
    addTilesToRack(player.rack, drawn);
    this.state.bag = this.bag.tiles;
    // turn not advanced
    this.state.events.push({ kind: 'redraw', slot, reason, tileCount, timestamp: Date.now() });
    this.armRevert(slot, pre);
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
    this.armRevert(slot, pre);
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

    // Silent revert: roll game state back to the pre-action snapshot,
    // leaving no trace in the event log (so per-move badges, scores,
    // assists, etc. all return to the pre-action state cleanly).
    this.state = this.lastSnapshot.state;
    // Keep the existing seeded rng closure; rewind the bag's tile array to the restored state.
    this.bag.tiles = [...this.state.bag];
    this.state.bag = this.bag.tiles;

    this.lastSnapshot = null;
  }

  private armRevert(slot: Slot, preState: GameState): void {
    this.lastSnapshot = { state: preState, bySlot: slot };
  }

  private maybeClearRevertOnActionBy(slot: Slot): void {
    if (this.lastSnapshot !== null && this.lastSnapshot.bySlot !== slot) {
      this.lastSnapshot = null;
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
