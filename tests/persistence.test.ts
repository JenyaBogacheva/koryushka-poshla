// tests/persistence.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveActiveGame, loadActiveGame, archiveFinishedGame, listGameSummaries, loadArchive } from '../server/persistence';
import type { GameState, GameArchive } from '@shared/types';
import { createEmptyBoard } from '../server/board.js';

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
    redrawEligible: false,
    canRevert: false,
  })) as unknown as GameState['players'],
  turnIndex: 0,
  board: Array.from({ length: 15 }, () => Array(15).fill(null)),
  bag: [],
  centerBonusUsed: false,
  events: [],
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
    const archive = archiveFinishedGame(dataDir);
    expect(archive.players[0]!.finalScore).toBe(100);
    expect(archive.winnerSlot).toBe(0);
    expect(loadActiveGame(dataDir)).toBeNull();
    expect(existsSync(path.join(dataDir, 'history'))).toBe(true);
    // New flat shape: finalBoard and events must be present
    expect(Array.isArray(archive.finalBoard)).toBe(true);
    expect(Array.isArray(archive.events)).toBe(true);
  });

  it('saveActiveGame leaves no .tmp on success', () => {
    saveActiveGame(dataDir, sampleState());
    expect(existsSync(path.join(dataDir, 'game.json'))).toBe(true);
    expect(existsSync(path.join(dataDir, 'game.json.tmp'))).toBe(false);
  });

  it('saveActiveGame overwrites an existing file (rename semantics)', () => {
    saveActiveGame(dataDir, sampleState());
    const b = sampleState();
    b.turnIndex = 2;
    saveActiveGame(dataDir, b);
    const reloaded = JSON.parse(readFileSync(path.join(dataDir, 'game.json'), 'utf-8'));
    expect(reloaded.turnIndex).toBe(2);
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

  it('loadActiveGame accepts legacy "history" field and migrates to events on next save', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scrabble-legacy-'));
    const legacy = {
      phase: 'playing',
      players: [0, 1, 2].map((slot) => ({
        slot,
        name: `Player${slot}`,
        connected: true,
        rack: [],
        rackVisible: true,
        score: 0,
        redrawEligible: false,
        canRevert: false,
      })),
      turnIndex: 0,
      board: createEmptyBoard(),
      bag: [],
      centerBonusUsed: false,
      history: [],         // legacy field
      startedAt: 1,
    };
    writeFileSync(path.join(dir, 'game.json'), JSON.stringify(legacy), 'utf-8');
    const loaded = loadActiveGame(dir);
    expect(loaded).not.toBeNull();
    expect(loaded!.events).toEqual([]);
    expect((loaded as unknown as { history?: unknown }).history).toBeUndefined();
  });

  it('archiveFinishedGame writes a flat GameArchive with finalBoard and events; loadArchive round-trips', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scrabble-archive-'));
    const s = { ...sampleState(), phase: 'finished' as const };
    s.events = [{ kind: 'pass', slot: 0 as 0 | 1 | 2, timestamp: 1 }];
    saveActiveGame(dir, s);
    const archive = archiveFinishedGame(dir);
    expect(archive.events.length).toBeGreaterThan(0);
    expect(archive.finalBoard.length).toBe(15);
    // Round-trip:
    const loaded = loadArchive(dir, archive.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(archive.id);
    expect(loaded!.events.length).toBe(archive.events.length);
  });

  it('listGameSummaries returns just the summary slice from a flat GameArchive on disk', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scrabble-summaries-'));
    const histDir = path.join(dir, 'history');
    mkdirSync(histDir, { recursive: true });
    const archive: GameArchive = {
      id: 'g-1', startedAt: 1, finishedAt: 2,
      players: [
        { slot: 0, name: 'A', finalScore: 10 },
        { slot: 1, name: 'B', finalScore: 7 },
        { slot: 2, name: 'C', finalScore: 3 },
      ],
      winnerSlot: 0,
      finalBoard: createEmptyBoard(),
      events: [],
    };
    writeFileSync(path.join(histDir, 'g-1.json'), JSON.stringify(archive), 'utf-8');
    const list = listGameSummaries(dir);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: 'g-1', startedAt: 1, finishedAt: 2,
      players: archive.players, winnerSlot: 0,
    });
  });
});

import { Game } from '../server/game.js';
import type { MoveRecord } from '@shared/types';

describe('MoveRecord.dictionaryWarnings persistence', () => {
  it('round-trips dictionaryWarnings through save/load', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scrabble-dictw-'));
    const s = sampleState();
    const moveRecord: MoveRecord = {
      kind: 'move', slot: 0, placements: [], wordsFormed: [],
      totalScore: 10, bingoBonus: false, helperSlot: null,
      dictionaryWarnings: ['ЯБЛЫРГ'], timestamp: 1,
    };
    s.events = [moveRecord];
    saveActiveGame(dir, s);
    const loaded = loadActiveGame(dir)!;
    const ev = loaded.events[0]!;
    expect(ev.kind).toBe('move');
    if (ev.kind === 'move') expect(ev.dictionaryWarnings).toEqual(['ЯБЛЫРГ']);
  });

  it('back-fills missing dictionaryWarnings as []', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scrabble-backfill-'));
    const s = sampleState() as unknown as Record<string, unknown>;
    s['events'] = [{
      kind: 'move', slot: 0, placements: [], wordsFormed: [],
      totalScore: 5, bingoBonus: false, helperSlot: null, timestamp: 1,
    }];
    writeFileSync(path.join(dir, 'game.json'), JSON.stringify(s), 'utf-8');
    const loaded = loadActiveGame(dir)!;
    const ev = loaded.events[0]!;
    expect(ev.kind).toBe('move');
    if (ev.kind === 'move') expect(ev.dictionaryWarnings).toEqual([]);
  });
});

describe('persistence: revert window is not preserved', () => {
  it('round-trips without canRevert leaking into the loaded state', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scrabble-revert-'));
    const g = new Game({ seed: 3 });
    g.joinPlayer(0, 'A'); g.joinPlayer(1, 'B'); g.joinPlayer(2, 'C');
    g.startGame();
    g.passTurn(0);
    expect(g.snapshot().players[0]!.canRevert).toBe(true);
    saveActiveGame(dir, g.snapshot());
    const loaded = loadActiveGame(dir)!;
    const g2 = Game.fromState(loaded);
    expect(g2.snapshot().players[0]!.canRevert).toBe(false);
    expect(() => g2.revertLastTurn(0)).toThrow();
  });
});
