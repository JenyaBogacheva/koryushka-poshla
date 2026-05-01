import { Game } from './game.js';
import type { GameState, Placement, Slot, Tile } from '@shared/types';
import { SIZE } from './board.js';

export type ScriptedRunOptions = {
  /** Delay between moves in milliseconds. 0 in tests/demo, ~2000 in the live server so a human can watch. */
  delayMs: number;
  /** Called with the initial post-startGame snapshot, then after each submitMove/passTurn and after endGame. */
  onSnapshot: (state: GameState) => void;
};

const NUM_TURNS = 9;

function pickPlayedAs(t: Tile): string {
  if (t.isBlank) return 'А';
  return t.letter;
}

function findEmptyAdjacent(board: GameState['board']): { row: number; col: number } | null {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r]![c] !== null) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr]![nc] !== null) {
          return { row: r, col: c };
        }
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return ms === 0 ? Promise.resolve() : new Promise((res) => setTimeout(res, ms));
}

export function buildScriptedGame(): Game {
  const g = new Game({ seed: 42 });
  g.joinPlayer(0, 'Женя');
  g.joinPlayer(1, 'Мама');
  g.joinPlayer(2, 'Папа');
  g.startGame();
  while (g.snapshot().phase === 'drawing') {
    const ds = g.snapshot().drawState!;
    for (const slot of ds.candidates) {
      const cur = g.snapshot().drawState!;
      if (cur.draws.some((d) => d.slot === slot)) continue;
      g.drawForOrderTile(slot);
    }
  }
  return g;
}

export async function runScriptedGame(g: Game, opts: ScriptedRunOptions): Promise<void> {
  // Emit the initial post-startGame snapshot so listeners see the dealt racks.
  opts.onSnapshot(g.snapshot());
  await sleep(opts.delayMs);

  for (let turn = 0; turn < NUM_TURNS; turn++) {
    const s = g.snapshot();
    const slot = s.turnIndex as Slot;
    const player = s.players[slot]!;
    const tile = player.rack[0];

    if (!tile) {
      g.passTurn(slot);
    } else {
      let placement: Placement;
      if (turn === 0) {
        placement = { tileId: tile.id, row: 7, col: 7, playedAs: pickPlayedAs(tile) };
      } else {
        const spot = findEmptyAdjacent(s.board);
        if (!spot) {
          g.passTurn(slot);
          opts.onSnapshot(g.snapshot());
          await sleep(opts.delayMs);
          continue;
        }
        placement = { tileId: tile.id, row: spot.row, col: spot.col, playedAs: pickPlayedAs(tile) };
      }
      const result = g.submitMove(slot, [placement]);
      if (!result.ok) g.passTurn(slot);
    }

    opts.onSnapshot(g.snapshot());
    await sleep(opts.delayMs);
  }

  g.endGame(0);
  opts.onSnapshot(g.snapshot());
}
