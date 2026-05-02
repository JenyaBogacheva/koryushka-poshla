import { useEffect, useState } from 'react';
import type { GameSummary } from '@shared/types';

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
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-ink">Прошлые игры</h1>
        <a href="#" className="text-sm text-ink/70 hover:underline">← назад</a>
      </header>
      {error !== null && <p className="text-red-700">Ошибка: {error}</p>}
      {items === null && error === null && <p>Загрузка…</p>}
      {items !== null && items.length === 0 && <p>Пока нет архивных игр.</p>}
      {items !== null && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((g) => (
            <li key={g.id} className="rounded bg-tile p-3 shadow-sm">
              <a href={`#past/${g.id}`} className="block hover:underline">
                <div className="text-sm text-ink/70">{new Date(g.finishedAt).toLocaleString('ru-RU')}</div>
                <div className="text-base">
                  {g.players.map((p) => `${p.name} — ${p.finalScore}`).join(' · ')}
                </div>
                <div className="text-sm text-ink/70">
                  Победитель: {g.winnerSlot === null ? 'ничья' : (g.players.find((p) => p.slot === g.winnerSlot)?.name ?? '—')}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
