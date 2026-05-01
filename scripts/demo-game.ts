import type { GameState } from '@shared/types';
import { buildScriptedGame, runScriptedGame } from '../server/scripted-game.js';

let lastTurn = -1;

function printSnapshot(state: GameState): void {
  const turn = state.events.length;
  if (turn !== lastTurn) {
    lastTurn = turn;
    const last = state.events[turn - 1];
    if (last && last.kind === 'move') {
      const player = state.players[last.slot]!;
      const placement = last.placements[0]!;
      console.log(
        `Turn ${turn - 1}: ${player.name} placed ${placement.playedAs} at (${placement.row},${placement.col}) — ` +
        `+${last.totalScore} (${last.wordsFormed.map((w) => w.word).join(', ')})`,
      );
    }
  }
}

async function main(): Promise<void> {
  const g = buildScriptedGame();
  await runScriptedGame(g, { delayMs: 0, onSnapshot: printSnapshot });
  const final = g.snapshot();
  console.log('\n=== Final scores ===');
  const sorted = [...final.players].sort((a, b) => b.score - a.score);
  for (const p of sorted) console.log(`  ${p.name.padEnd(8)} ${p.score}`);
  console.log(`Winner: ${sorted[0]!.name}`);
}

main();
