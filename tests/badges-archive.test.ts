import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildScriptedGame, runScriptedGame } from '../server/scripted-game';
import { saveActiveGame, archiveFinishedGame, loadArchive } from '../server/persistence';
import { perMoveBadges, endGameBadges } from '../server/badges';
import type { MoveRecord, Slot } from '../shared/types';

describe('badges over archive round-trip', () => {
  it('perMoveBadges and endGameBadges produce the same result against a freshly archived game and a reloaded one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scrabble-badges-'));
    try {
      const game = buildScriptedGame();
      await runScriptedGame(game, { delayMs: 0, onSnapshot: () => {} });
      // The scripted game ends in 'finished' phase. Persist + archive.
      saveActiveGame(dir, game.snapshot());
      const fresh = archiveFinishedGame(dir);
      const reloaded = loadArchive(dir, fresh.id);
      expect(reloaded).not.toBeNull();

      const computeAll = (events: typeof fresh.events, scores: Record<Slot, number>) => {
        const live: Record<Slot, string[]> = { 0: [], 1: [], 2: [] };
        for (const e of events) {
          if (e.kind === 'move') live[e.slot].push(...perMoveBadges(e as MoveRecord));
        }
        const end = endGameBadges(events, scores);
        return { live, end };
      };

      const scoresMap: Record<Slot, number> = {
        0: fresh.players.find((p) => p.slot === 0)!.finalScore,
        1: fresh.players.find((p) => p.slot === 1)!.finalScore,
        2: fresh.players.find((p) => p.slot === 2)!.finalScore,
      };

      const a = computeAll(fresh.events, scoresMap);
      const b = computeAll(reloaded!.events, scoresMap);

      // Determinism: same archive → same badges, before and after reload.
      expect(a).toEqual(b);

      // Sanity: at least one player has a place badge (someone scored highest).
      const allEnd = [...a.end[0], ...a.end[1], ...a.end[2]];
      expect(allEnd).toContain('gold');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
