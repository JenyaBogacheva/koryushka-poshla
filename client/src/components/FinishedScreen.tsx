import type { GameState } from '@shared/types';
import { sendNewGame } from '../ws.js';

type Props = { state: GameState };

export function FinishedScreen({ state }: Props) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0]!;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="w-[28rem] max-w-[90vw] rounded-xl bg-white p-6 text-center shadow-2xl">
        <div className="mb-1 text-2xl font-bold">Игра окончена</div>
        <div className="mb-4 text-lg">
          Победитель: <span className="font-semibold">{winner.name}</span> ({winner.score})
        </div>
        <ol className="mb-5 space-y-1">
          {sorted.map((p, i) => (
            <li key={p.slot} className="flex justify-between border-b border-ink/10 py-1">
              <span>{i + 1}. {p.name}</span>
              <span className="font-mono">{p.score}</span>
            </li>
          ))}
        </ol>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="rounded bg-emerald-600 px-4 py-2 text-white"
            onClick={() => sendNewGame()}
          >
            Новая игра
          </button>
          <a
            href="#past"
            className="rounded border border-ink/30 px-4 py-2"
          >
            К списку игр
          </a>
        </div>
      </div>
    </div>
  );
}
