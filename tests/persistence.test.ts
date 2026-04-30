// tests/persistence.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveActiveGame, loadActiveGame, archiveFinishedGame, listGameSummaries } from '../server/persistence';
import type { GameState } from '@shared/types';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'scrabble-test-'));
});

const sampleState = (): GameState => ({
  phase: 'playing',
  players: [0, 1, 2].map((slot) => ({
    slot: slot as 0 | 1 | 2,
    name: `Player${slot}`,
    connected: true,
    rack: [],
    rackVisible: true,
    score: 0,
  })) as unknown as GameState['players'],
  turnIndex: 0,
  board: Array.from({ length: 15 }, () => Array(15).fill(null)),
  bag: [],
  centerBonusUsed: false,
  history: [],
  startedAt: 1_700_000_000_000,
});

describe('persistence', () => {
  it('save then load roundtrips the active game', () => {
    const s = sampleState();
    saveActiveGame(dataDir, s);
    const loaded = loadActiveGame(dataDir);
    expect(loaded?.phase).toBe('playing');
    expect(loaded?.players[0]!.name).toBe('Player0');
  });

  it('loadActiveGame returns null when no save', () => {
    expect(loadActiveGame(dataDir)).toBeNull();
  });

  it('archive moves finished game to history and clears active', () => {
    const s = { ...sampleState(), phase: 'finished' as const };
    s.players[0].score = 100;
    s.players[1].score = 50;
    s.players[2].score = 75;
    saveActiveGame(dataDir, s);
    const summary = archiveFinishedGame(dataDir);
    expect(summary.players[0]!.finalScore).toBe(100);
    expect(summary.winnerSlot).toBe(0);
    expect(loadActiveGame(dataDir)).toBeNull();
    expect(existsSync(path.join(dataDir, 'history'))).toBe(true);
  });

  it('listGameSummaries returns archived games sorted newest-first', async () => {
    const s = { ...sampleState(), phase: 'finished' as const };
    saveActiveGame(dataDir, s);
    archiveFinishedGame(dataDir);
    await new Promise(r => setTimeout(r, 5));
    saveActiveGame(dataDir, s);
    archiveFinishedGame(dataDir);
    const list = listGameSummaries(dataDir);
    expect(list.length).toBe(2);
    expect(list[0]!.finishedAt).toBeGreaterThanOrEqual(list[1]!.finishedAt);
  });
});
