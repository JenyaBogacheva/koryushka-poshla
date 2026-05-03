import type { GameState, Placement, Slot } from '@shared/types';
import { buildScriptedGame, runScriptedGame } from '../server/scripted-game.js';
import { SIZE } from '../server/board.js';
import { perMoveBadges, endGameBadges } from '../shared/badges.js';

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

function pickPlayedAs(tile: { isBlank: boolean; letter: string }): string {
  if (tile.isBlank) return 'А';
  return tile.letter;
}

async function main(): Promise<void> {
  const g = buildScriptedGame();

  // Run 2 initial turns normally
  let s = g.snapshot();
  printSnapshot(s);

  for (let turn = 0; turn < 2; turn++) {
    s = g.snapshot();
    const slot = s.turnIndex as Slot;
    const tile = s.players[slot]!.rack[0];

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
          printSnapshot(g.snapshot());
          continue;
        }
        placement = { tileId: tile.id, row: spot.row, col: spot.col, playedAs: pickPlayedAs(tile) };
      }
      const result = g.submitMove(slot, [placement]);
      if (!result.ok) g.passTurn(slot);
    }

    printSnapshot(g.snapshot());
  }

  // Turn 3: demonstrate assisted move + revert
  s = g.snapshot();
  const assistorSlot = s.turnIndex as Slot;
  const assistorTile = s.players[assistorSlot]!.rack[0];

  if (assistorTile) {
    const spot = findEmptyAdjacent(s.board);
    if (spot) {
      const placement: Placement = {
        tileId: assistorTile.id,
        row: spot.row,
        col: spot.col,
        playedAs: pickPlayedAs(assistorTile),
      };

      // Submit move, then attribute helper post-hoc (slot 0 helps if assistor is not 0, otherwise 1)
      const helperSlot: Slot = assistorSlot === 0 ? 1 : 0;
      console.log(`\n[ASSIST] ${s.players[assistorSlot]!.name} submits, then credits ${s.players[helperSlot]!.name}`);
      const result = g.submitMove(assistorSlot, [placement]);
      if (!result.ok) {
        console.log(`Assist move failed: ${result.error.kind}`);
        g.passTurn(assistorSlot);
      } else {
        const attr = g.attributeHelper(assistorSlot, helperSlot);
        if (!attr.ok) console.log(`Attribute failed: ${attr.error.kind}`);
      }

      printSnapshot(g.snapshot());

      // Immediately revert to test revert
      console.log(`[REVERT] ${s.players[assistorSlot]!.name} reverts the assisted move`);
      g.revertLastTurn(assistorSlot);
      printSnapshot(g.snapshot());

      // Re-submit without assist
      console.log(`[RE-SUBMIT] ${s.players[assistorSlot]!.name} re-submits without assist`);
      const resubmit = g.submitMove(assistorSlot, [placement]);
      if (!resubmit.ok) g.passTurn(assistorSlot);
      printSnapshot(g.snapshot());
    } else {
      g.passTurn(assistorSlot);
      printSnapshot(g.snapshot());
    }
  } else {
    g.passTurn(assistorSlot);
    printSnapshot(g.snapshot());
  }

  // Continue with remaining turns (we've already done 3, NUM_TURNS is 9)
  for (let turn = 3; turn < 9; turn++) {
    s = g.snapshot();
    const slot = s.turnIndex as Slot;
    const tile = s.players[slot]!.rack[0];

    if (!tile) {
      g.passTurn(slot);
    } else {
      const spot = findEmptyAdjacent(s.board);
      if (!spot) {
        g.passTurn(slot);
        printSnapshot(g.snapshot());
        continue;
      }
      const placement: Placement = {
        tileId: tile.id,
        row: spot.row,
        col: spot.col,
        playedAs: pickPlayedAs(tile),
      };
      const result = g.submitMove(slot, [placement]);
      if (!result.ok) g.passTurn(slot);
    }

    printSnapshot(g.snapshot());
  }

  g.endGame(0);
  const final = g.snapshot();
  console.log('\n=== Final scores ===');
  const sorted = [...final.players].sort((a, b) => b.score - a.score);
  for (const p of sorted) console.log(`  ${p.name.padEnd(8)} ${p.score}`);
  console.log(`Winner: ${sorted[0]!.name}`);

  // Per-game badges
  console.log('\n=== Badges ===');
  const scoresMap: Record<Slot, number> = {
    0: final.players[0]!.score,
    1: final.players[1]!.score,
    2: final.players[2]!.score,
  };
  const endBadges = endGameBadges(final.events, scoresMap);
  const perMoveTotals: Record<Slot, Record<string, number>> = { 0: {}, 1: {}, 2: {} };
  for (const e of final.events) {
    if (e.kind !== 'move') continue;
    for (const b of perMoveBadges(e)) {
      perMoveTotals[e.slot][b] = (perMoveTotals[e.slot][b] ?? 0) + 1;
    }
  }
  for (const slot of [0, 1, 2] as const) {
    const live = Object.entries(perMoveTotals[slot]).map(([k, v]) => `${k}×${v}`).join(', ');
    const end = endBadges[slot].join(', ');
    console.log(`  Slot ${slot} (${final.players[slot]!.name}) badges: end=[${end}] live=[${live}]`);
  }

  // Print events array for verification
  console.log('\n=== Event log (assist + revert records) ===');
  for (const evt of final.events) {
    if (evt.kind === 'move') {
      console.log(`move: slot=${evt.slot}, score=${evt.totalScore}, words=${evt.wordsFormed.map((w) => w.word).join(',')}`);
    } else if (evt.kind === 'assist') {
      console.log(`assist: from=${evt.fromSlot}, to=${evt.toSlot}, points=${evt.points}, forMove=${evt.forMoveIndex}`);
    } else if (evt.kind === 'revert') {
      console.log(`revert: slot=${evt.slot}, reverted=${evt.revertedKind}`);
    } else if (evt.kind === 'pass') {
      console.log(`pass: slot=${evt.slot}`);
    } else if (evt.kind === 'endGame') {
      console.log(`endGame: slot=${evt.slot}, cause=${evt.cause}`);
    } else {
      console.log(`${evt.kind}`);
    }
  }
}

main();
