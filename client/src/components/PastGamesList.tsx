import { useEffect, useState } from 'react';
import type { GameSummary } from '@shared/types';
import { fishForSlot } from '../fish.js';
import { BackLink } from './BackLink.js';

export function PastGamesList() {
  const [items, setItems] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/history')
      .then((r) => (r.ok ? (r.json() as Promise<GameSummary[]>) : Promise.reject(new Error(`${r.status}`))))
      .then((data) => setItems(data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main className="relative mx-auto max-w-2xl px-8 py-10">
      <BackLink href="#" label="к игре" />
      <header className="mb-6 mt-12 lg:mt-14">
        <h1 className="font-heading font-bold leading-none" style={{ fontSize: 44 }}>
          Прошлые игры
        </h1>
      </header>

      {error !== null && (
        <p
          className="font-heading rounded-xl px-4 py-2.5 text-base font-semibold"
          style={{
            background: 'rgba(177,77,44,0.14)',
            color: 'var(--color-accent)',
            boxShadow: 'inset 0 0 0 1.5px rgba(177,77,44,0.4)',
          }}
        >
          Ошибка: {error}
        </p>
      )}
      {items === null && error === null && <p className="text-ink-soft">Загрузка…</p>}
      {items !== null && items.length === 0 && (
        <p className="text-ink-soft italic">Пока нет архивных игр.</p>
      )}
      {items !== null && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((g) => {
            const winner = g.winnerSlot === null
              ? null
              : g.players.find((p) => p.slot === g.winnerSlot) ?? null;
            const winnerFish = winner !== null ? fishForSlot(winner.slot) : null;
            return (
              <li key={g.id}>
                <a
                  href={`#past/${g.id}`}
                  className="relative block overflow-hidden rounded-2xl px-5 py-4 transition-transform hover:-translate-y-0.5"
                  style={{
                    background: winnerFish !== null
                      ? `linear-gradient(135deg, ${winnerFish.soft}80 0%, var(--color-panel) 80%)`
                      : 'var(--color-panel)',
                    boxShadow: '0 2px 0 rgba(60,50,35,0.06), 0 6px 18px rgba(60,50,35,0.08)',
                  }}
                >
                  {winnerFish !== null && (
                    <img
                      src={winnerFish.src}
                      alt=""
                      aria-hidden
                      className="pointer-events-none absolute"
                      style={{ right: -28, top: -8, width: 130, opacity: 0.18 }}
                    />
                  )}
                  <div className="relative text-sm uppercase tracking-wider text-ink-soft">
                    {new Date(g.finishedAt).toLocaleString('ru-RU')}
                  </div>
                  <div className="relative mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {g.players.map((p) => {
                      const f = fishForSlot(p.slot);
                      return (
                        <span key={p.slot} className="inline-flex items-baseline gap-1.5">
                          <span
                            className="font-heading font-bold leading-none"
                            style={{ fontSize: 20, color: f.deep }}
                          >
                            {p.name}
                          </span>
                          <span
                            className="font-heading font-bold tabular-nums leading-none"
                            style={{ fontSize: 20, color: f.deep }}
                          >
                            {p.finalScore}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                  <div className="relative mt-1 text-sm text-ink-soft">
                    Победитель:{' '}
                    {winner === null ? (
                      'ничья'
                    ) : (
                      <span
                        className="font-heading font-bold"
                        style={{ color: winnerFish!.deep }}
                      >
                        {winner.name}
                      </span>
                    )}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
