import { useEffect, useState } from 'react';
import type { BadgeKind, GameArchive, GameState, Player, Slot } from '@shared/types';
import { Board } from './Board.js';
import { MoveLog } from './MoveLog.js';
import { BadgeStrip } from './BadgeStrip.js';
import { perMoveBadges, endGameBadges } from '@server/badges.js';

export function PastGamesDetail({ id }: { id: string }) {
  const [archive, setArchive] = useState<GameArchive | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/history/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<GameArchive>) : Promise.reject(new Error(`${r.status}`))))
      .then((data) => setArchive(data))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error !== null) return <p className="p-6 text-red-700">Ошибка: {error}</p>;
  if (archive === null) return <p className="p-6">Загрузка…</p>;

  const players = archive.players.map((p) => ({
    slot: p.slot,
    name: p.name,
    connected: false,
    rack: [],
    rackVisible: false,
    score: p.finalScore,
    redrawEligible: false,
    canRevert: false,
  })) as unknown as [Player, Player, Player];

  const fakeState: GameState = {
    phase: 'finished',
    players,
    turnIndex: 0,
    board: archive.finalBoard,
    bag: [],
    centerBonusUsed: false,
    events: archive.events,
    startedAt: archive.startedAt,
    drawState: null,
  };

  const scoresMap: Record<Slot, number> = {
    0: archive.players.find((p) => p.slot === 0)?.finalScore ?? 0,
    1: archive.players.find((p) => p.slot === 1)?.finalScore ?? 0,
    2: archive.players.find((p) => p.slot === 2)?.finalScore ?? 0,
  };
  const endBadges = endGameBadges(archive.events, scoresMap);

  const perPlayerBadges: Record<Slot, BadgeKind[]> = { 0: [], 1: [], 2: [] };
  for (const slot of [0, 1, 2] as const) {
    const live: BadgeKind[] = [];
    for (const e of archive.events) {
      if (e.kind === 'move' && e.slot === slot) live.push(...perMoveBadges(e));
    }
    perPlayerBadges[slot] = [...endBadges[slot], ...live];
  }

  return (
    <main className="grid grid-cols-[auto_18rem] gap-4 p-4">
      <div>
        <header className="mb-2 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold">
            {new Date(archive.finishedAt).toLocaleString('ru-RU')}
          </h1>
          <a href="#past" className="text-sm text-ink/70 hover:underline">← назад</a>
        </header>
        <Board board={archive.finalBoard} readOnly />
      </div>
      <aside className="flex h-[80vh] flex-col gap-2">
        <ul className="space-y-1 rounded bg-tile p-2 text-sm shadow-sm">
          {archive.players.map((p) => (
            <li key={p.slot} className={archive.winnerSlot === p.slot ? 'font-semibold' : ''}>
              <div>{p.name} — <span className="tabular-nums">{p.finalScore}</span></div>
              <BadgeStrip badges={perPlayerBadges[p.slot]} />
            </li>
          ))}
        </ul>
        <MoveLog state={fakeState} />
      </aside>
    </main>
  );
}
