import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { GameState, GameSummary, Slot } from '@shared/types';

const ACTIVE_FILE = 'game.json';
const HISTORY_DIR = 'history';

export function saveActiveGame(dataDir: string, state: GameState): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(dataDir, ACTIVE_FILE), JSON.stringify(state), 'utf-8');
}

export function loadActiveGame(dataDir: string): GameState | null {
  const file = path.join(dataDir, ACTIVE_FILE);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8')) as GameState;
}

export function archiveFinishedGame(dataDir: string): GameSummary {
  const state = loadActiveGame(dataDir);
  if (!state) throw new Error('No active game to archive');
  const id = `g-${Date.now()}`;
  const players = state.players.map((p) => ({ slot: p.slot, name: p.name, finalScore: p.score }));
  const top = Math.max(...players.map((p) => p.finalScore));
  const winners = players.filter((p) => p.finalScore === top);
  const winnerSlot: Slot | null = winners.length === 1 ? winners[0]!.slot : null;
  const summary: GameSummary = {
    id,
    startedAt: state.startedAt ?? Date.now(),
    finishedAt: Date.now(),
    players,
    winnerSlot,
  };
  const histDir = path.join(dataDir, HISTORY_DIR);
  mkdirSync(histDir, { recursive: true });
  writeFileSync(path.join(histDir, `${id}.json`), JSON.stringify({ summary, state }), 'utf-8');
  rmSync(path.join(dataDir, ACTIVE_FILE));
  return summary;
}

export function listGameSummaries(dataDir: string): GameSummary[] {
  const histDir = path.join(dataDir, HISTORY_DIR);
  if (!existsSync(histDir)) return [];
  const files = readdirSync(histDir).filter((f) => f.endsWith('.json'));
  const summaries = files.map((f) => {
    const raw = JSON.parse(readFileSync(path.join(histDir, f), 'utf-8')) as { summary: GameSummary };
    return raw.summary;
  });
  summaries.sort((a, b) => b.finishedAt - a.finishedAt);
  return summaries;
}
