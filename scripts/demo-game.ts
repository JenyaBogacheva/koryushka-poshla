import { Game } from '../server/game.js';
import type { Placement, Slot, Tile } from '../shared/types.js';
import { SIZE } from '../server/board.js';

function pickPlayedAs(t: Tile): string {
  if (t.isBlank) return 'А';
  return t.letter;
}

function findEmptyAdjacent(board: ReturnType<Game['snapshot']>['board']): { row: number; col: number } | null {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r]![c] !== null) continue;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr]![nc] !== null) {
          return { row: r, col: c };
        }
      }
    }
  }
  return null;
}

function main() {
  const g = new Game({ seed: 42 });
  g.joinPlayer(0, 'Женя');
  g.joinPlayer(1, 'Мама');
  g.joinPlayer(2, 'Папа');
  g.startGame();

  const NUM_TURNS = 9;
  for (let turn = 0; turn < NUM_TURNS; turn++) {
    const s = g.snapshot();
    const slot = s.turnIndex as Slot;
    const player = s.players[slot]!;
    const tile = player.rack[0];
    if (!tile) { console.log(`Turn ${turn}: ${player.name} has no tile, passing`); g.passTurn(slot); continue; }

    let placement: Placement;
    if (turn === 0) {
      // First move — must cover center.
      placement = { tileId: tile.id, row: 7, col: 7, playedAs: pickPlayedAs(tile) };
    } else {
      const spot = findEmptyAdjacent(s.board);
      if (!spot) { console.log(`Turn ${turn}: ${player.name} no spot, passing`); g.passTurn(slot); continue; }
      placement = { tileId: tile.id, row: spot.row, col: spot.col, playedAs: pickPlayedAs(tile) };
    }

    const result = g.submitMove(slot, [placement]);
    if (result.ok) {
      console.log(
        `Turn ${turn}: ${player.name} placed ${placement.playedAs} at (${placement.row},${placement.col}) — ` +
        `+${result.moveRecord.totalScore} (${result.moveRecord.wordsFormed.map((w) => w.word).join(', ')})`,
      );
    } else {
      console.log(`Turn ${turn}: ${player.name} move rejected: ${result.error.kind}; passing`);
      g.passTurn(slot);
    }
  }

  g.endGame(0);
  const final = g.snapshot();
  console.log('\n=== Final scores ===');
  const sorted = [...final.players].sort((a, b) => b.score - a.score);
  for (const p of sorted) console.log(`  ${p.name.padEnd(8)} ${p.score}`);
  console.log(`Winner: ${sorted[0]!.name}`);
}

main();
