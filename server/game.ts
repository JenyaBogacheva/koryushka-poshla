import type { GameState, Player, Slot, Tile } from '@shared/types';
import { createBag, drawTiles, makeRng, type Bag } from './bag.js';
import { addTilesToRack } from './rack.js';
import { createEmptyBoard } from './board.js';

export type GameOpts = { seed: number };

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
      recentGames: [],
    };
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
  }

  snapshot(): GameState {
    return structuredClone(this.state);
  }
}
