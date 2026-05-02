import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { GameState, GameSummary, GameArchive, GameEvent, MoveRecord, Slot } from '@shared/types';

const ACTIVE_FILE = 'game.json';
const HISTORY_DIR = 'history';

function backfillEvents(events: GameEvent[]): void {
  for (const ev of events) {
    if (ev.kind === 'move' && (ev as Partial<MoveRecord>).dictionaryWarnings === undefined) {
      (ev as MoveRecord).dictionaryWarnings = [];
    }
  }
}

// NOTE: GameState's per-player `canRevert` is recomputed from the engine's transient
// `lastSnapshot` field, which is intentionally NOT persisted. A server restart drops
// the revert window — acceptable hard boundary; no game state is lost.
export function saveActiveGame(dataDir: string, state: GameState): void {
  mkdirSync(dataDir, { recursive: true });
  const final = path.join(dataDir, ACTIVE_FILE);
  const tmp = `${final}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), 'utf-8');
  renameSync(tmp, final);
}

export function loadActiveGame(dataDir: string): GameState | null {
  const file = path.join(dataDir, ACTIVE_FILE);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as GameState & { history?: unknown };
  if (raw.events === undefined && Array.isArray(raw.history)) {
    raw.events = raw.history as GameEvent[];
    delete raw.history;
  }
  if (Array.isArray(raw.events)) backfillEvents(raw.events);
  return raw;
}

export function archiveFinishedGame(dataDir: string): GameArchive {
  const state = loadActiveGame(dataDir);
  if (!state) throw new Error('No active game to archive');
  const id = `g-${Date.now()}`;
  const players = state.players.map((p) => ({
    slot: p.slot, name: p.name, finalScore: p.score,
  }));
  const top = Math.max(...players.map((p) => p.finalScore));
  const winners = players.filter((p) => p.finalScore === top);
  const winnerSlot: Slot | null = winners.length === 1 ? winners[0]!.slot : null;
  const archive: GameArchive = {
    id,
    startedAt: state.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    players,
    winnerSlot,
    finalBoard: state.board,
    events: state.events,
  };
  const histDir = path.join(dataDir, HISTORY_DIR);
  mkdirSync(histDir, { recursive: true });
  writeFileSync(path.join(histDir, `${id}.json`), JSON.stringify(archive), 'utf-8');
  rmSync(path.join(dataDir, ACTIVE_FILE));
  return archive;
}

export function listGameSummaries(dataDir: string): GameSummary[] {
  const histDir = path.join(dataDir, HISTORY_DIR);
  if (!existsSync(histDir)) return [];
  const files = readdirSync(histDir).filter((f) => f.endsWith('.json'));
  const summaries: GameSummary[] = files.map((f) => {
    const raw = JSON.parse(readFileSync(path.join(histDir, f), 'utf-8')) as
      | { summary: GameSummary }
      | GameArchive;
    if ('summary' in raw) return raw.summary;
    return {
      id: raw.id,
      startedAt: raw.startedAt,
      finishedAt: raw.finishedAt,
      players: raw.players,
      winnerSlot: raw.winnerSlot,
    };
  });
  summaries.sort((a, b) => b.finishedAt - a.finishedAt);
  return summaries;
}

export function loadArchive(dataDir: string, id: string): GameArchive | null {
  const file = path.join(dataDir, HISTORY_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as
    | { summary: GameSummary; state: GameState & { history?: unknown } }
    | GameArchive;
  if ('summary' in raw) {
    // Legacy { summary, state } shape: synthesize a flat GameArchive.
    const events = ((raw.state.events ?? raw.state.history) as GameEvent[] | undefined) ?? [];
    backfillEvents(events);
    return {
      id: raw.summary.id,
      startedAt: raw.summary.startedAt,
      finishedAt: raw.summary.finishedAt,
      players: raw.summary.players,
      winnerSlot: raw.summary.winnerSlot,
      finalBoard: raw.state.board,
      events,
    };
  }
  backfillEvents(raw.events);
  return raw;
}
