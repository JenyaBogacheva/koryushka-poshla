import type { GameState, Player, Slot, Tile, Placement, MoveRecord, WordFormed } from '@shared/types';
import { createBag, drawTiles, returnTiles, makeRng, bagFromTiles, type Bag } from './bag.js';
import { addTilesToRack, removeTilesFromRack, redrawEligible } from './rack.js';
import { createEmptyBoard, applyPlacements, isEmpty, extractWordsFormed } from './board.js';
import { validateMove, type MoveError } from './moves.js';
import { scoreMove } from './scoring.js';
import { checkWords } from './dictionary.js';

export type GameOpts = { seed: number };

export type SubmitResult =
  | { ok: true; moveRecord: MoveRecord; dictionaryWarnings: string[] }
  | { ok: false; error: MoveError | { kind: 'not-your-turn' } | { kind: 'not-playing' } };

export class Game {
  private state: GameState;
  private bag: Bag;

  constructor(opts: GameOpts) {
    this.bag = createBag(makeRng(opts.seed));
    const players: [Player, Player, Player] = [0, 1, 2].map((slot) => ({
      slot: slot as Slot,
      name: '',
      connected: false,
      rack: [] as Tile[],
      rackVisible: true,
      score: 0,
    })) as [Player, Player, Player];
    this.state = {
      phase: 'waiting',
      players,
      turnIndex: 0,
      board: createEmptyBoard(),
      bag: this.bag.tiles,
      centerBonusUsed: false,
      history: [],
      startedAt: null,
    };
  }

  static fromState(state: GameState): Game {
    const g = Object.create(Game.prototype) as Game;
    const cloned = structuredClone(state);
    const bag = bagFromTiles(cloned.bag, makeRng(Date.now()));
    cloned.bag = bag.tiles;
    (g as unknown as { bag: Bag; state: GameState }).bag = bag;
    (g as unknown as { bag: Bag; state: GameState }).state = cloned;
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
    for (const p of this.state.players) {
      const drawn = drawTiles(this.bag, 7);
      addTilesToRack(p.rack, drawn);
    }
    this.state.phase = 'playing';
    this.state.bag = this.bag.tiles;
    this.state.startedAt = Date.now();
  }

  submitMove(slot: Slot, placements: Placement[]): SubmitResult {
    if (this.state.phase !== 'playing') return { ok: false, error: { kind: 'not-playing' } };
    if (slot !== this.state.turnIndex) return { ok: false, error: { kind: 'not-your-turn' } };
    const player = this.state.players[slot]!;

    const isFirst = isEmpty(this.state.board);
    const validation = validateMove(this.state.board, player.rack, placements, isFirst);
    if (!validation.ok) return { ok: false, error: validation.error };

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

    const moveRecord: MoveRecord = {
      slot,
      placements,
      wordsFormed: score.perWord.map<WordFormed>((w) => ({
        word: w.word, cells: w.cells, score: w.score,
      })),
      totalScore: score.totalScore,
      bingoBonus: score.bingoBonus,
      timestamp: Date.now(),
    };
    this.state.history.push(moveRecord);
    this.state.turnIndex = ((slot + 1) % 3) as Slot;

    const dictionaryWarnings = checkWords(words.map((w) => w.word));
    return { ok: true, moveRecord, dictionaryWarnings };
  }

  snapshot(): GameState {
    return structuredClone(this.state);
  }

  passTurn(slot: Slot): void {
    this.assertTurn(slot);
    this.state.turnIndex = ((slot + 1) % 3) as Slot;
  }

  swapTiles(slot: Slot, tileIds: string[]): void {
    this.assertTurn(slot);
    if (new Set(tileIds).size !== tileIds.length) {
      throw new Error('Duplicate tile id in swap request');
    }
    const player = this.state.players[slot]!;
    const removed = removeTilesFromRack(player.rack, tileIds);
    returnTiles(this.bag, removed);
    const drawn = drawTiles(this.bag, removed.length);
    addTilesToRack(player.rack, drawn);
    this.state.bag = this.bag.tiles;
    this.state.turnIndex = ((slot + 1) % 3) as Slot;
  }

  redrawRack(slot: Slot): void {
    this.assertTurn(slot);
    const player = this.state.players[slot]!;
    if (!redrawEligible(player.rack)) {
      throw new Error('Rack is not eligible for free redraw (must be all vowels or all consonants)');
    }
    const allIds = player.rack.map((t) => t.id);
    const removed = removeTilesFromRack(player.rack, allIds);
    returnTiles(this.bag, removed);
    const drawn = drawTiles(this.bag, 7);
    addTilesToRack(player.rack, drawn);
    this.state.bag = this.bag.tiles;
    // turn not advanced
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
    // Perform swap.
    const blank = cell.tile;
    player.rack.splice(idx, 1);
    player.rack.push(blank);
    this.state.board[row]![col] = {
      tile: real,
      playedAs: cell.playedAs,
      fromBlank: false,
    };
  }

  endGame(_slot: Slot): void {
    if (this.state.phase !== 'playing') return; // idempotent if already finished
    this.state.phase = 'finished';
  }

  toggleRackVisibility(slot: Slot, visible: boolean): void {
    this.state.players[slot]!.rackVisible = visible;
  }

  private assertTurn(slot: Slot): void {
    if (this.state.phase !== 'playing') throw new Error('Game is not in playing phase');
    if (slot !== this.state.turnIndex) throw new Error(`Not slot ${slot}'s turn`);
  }
}
