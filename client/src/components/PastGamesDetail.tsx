import { useEffect, useState } from 'react';
import type { BadgeKind, GameArchive, GameState, Player, Slot } from '@shared/types';
import { Board } from './Board.js';
import { MoveLog } from './MoveLog.js';
import { BadgeStrip } from './BadgeStrip.js';
import { perMoveBadges, endGameBadges } from '@shared/badges.js';
import { fishForSlot } from '../fish.js';
import { BackLink } from './BackLink.js';

export function PastGamesDetail({ id }: { id: string }) {
  const [archive, setArchive] = useState<GameArchive | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/history/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<GameArchive>) : Promise.reject(new Error(`${r.status}`))))
      .then((data) => setArchive(data))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error !== null) {
    return (
      <p
        className="font-heading m-6 rounded-xl px-4 py-2.5 text-base font-semibold"
        style={{
          background: 'rgba(177,77,44,0.14)',
          color: 'var(--color-accent)',
          boxShadow: 'inset 0 0 0 1.5px rgba(177,77,44,0.4)',
        }}
      >
        Ошибка: {error}
      </p>
    );
  }
  if (archive === null) return <p className="p-6 text-ink-soft">Загрузка…</p>;

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
    turnOrder: [0, 1, 2],
    board: archive.finalBoard,
    bag: [],
    centerBonusUsed: false,
    events: archive.events,
    startedAt: archive.startedAt,
    drawState: null,
    pendingSwap: null,
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

  const winner =
    archive.winnerSlot === null
      ? null
      : archive.players.find((p) => p.slot === archive.winnerSlot) ?? null;
  const winnerFish = winner !== null ? fishForSlot(winner.slot) : null;

  return (
    <main
      className="relative mx-auto grid h-screen max-w-[1400px] items-start gap-10 overflow-hidden px-10 pb-8 pt-16 lg:px-12 lg:pt-20"
      style={{ gridTemplateColumns: '1fr 360px' }}
    >
      <BackLink href="#past" label="к списку" />
      <div className="flex h-full min-h-0 flex-col items-center gap-10">
        <header className="flex w-full items-center gap-6 self-start" style={{ marginLeft: 6 }}>
          <div className="relative shrink-0" style={{ width: 170, height: 80 }}>
            <img
              src={(winnerFish ?? fishForSlot(0)).src}
              alt=""
              aria-hidden
              className="absolute"
              style={{ width: 180, left: -8, top: -10 }}
            />
          </div>
          <div className="flex-1">
            <h1 className="font-heading font-bold leading-[0.85] tracking-tight" style={{ fontSize: 48 }}>
              Корюшка пошла
            </h1>
            <p className="mt-2 text-sm italic leading-[1.35] text-ink-soft">
              {new Date(archive.finishedAt).toLocaleString('ru-RU')}
              {winner !== null && (
                <>
                  {' · победитель — '}
                  <span className="font-heading font-bold not-italic" style={{ color: winnerFish!.deep }}>
                    {winner.name}
                  </span>
                </>
              )}
            </p>
          </div>
        </header>
        <Board board={archive.finalBoard} readOnly />
      </div>
      <aside className="flex h-full min-h-0 min-w-0 flex-col gap-3">
        <ul
          className="space-y-2 rounded-2xl p-4"
          style={{
            background: 'var(--color-panel)',
            boxShadow: '0 2px 0 rgba(60,50,35,0.06), 0 6px 18px rgba(60,50,35,0.08)',
          }}
        >
          {archive.players.map((p) => {
            const fish = fishForSlot(p.slot);
            const isWinner = archive.winnerSlot === p.slot;
            return (
              <li
                key={p.slot}
                className="rounded-xl px-3 py-2"
                style={{
                  background: isWinner ? `${fish.soft}66` : 'transparent',
                  boxShadow: isWinner ? `inset 0 0 0 2px ${fish.accent}` : 'none',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <img src={fish.src} alt="" aria-hidden style={{ width: 26, height: 'auto' }} />
                    <span className="font-heading font-bold leading-none" style={{ fontSize: 22, color: fish.deep }}>
                      {p.name}
                    </span>
                  </span>
                  <span
                    className="font-heading font-bold tabular-nums leading-none"
                    style={{ fontSize: 24, color: fish.deep }}
                  >
                    {p.finalScore}
                  </span>
                </div>
                <BadgeStrip badges={perPlayerBadges[p.slot]} />
              </li>
            );
          })}
        </ul>
        <MoveLog state={fakeState} />
      </aside>
    </main>
  );
}
