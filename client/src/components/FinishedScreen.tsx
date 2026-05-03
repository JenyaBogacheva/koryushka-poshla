import type { GameState } from '@shared/types';
import { sendNewGame } from '../ws.js';
import { fishForSlot } from '../fish.js';

type Props = { state: GameState };

export function FinishedScreen({ state }: Props) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0]!;
  const winnerFish = fishForSlot(winner.slot);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="relative w-[30rem] max-w-[90vw] overflow-hidden rounded-2xl p-7 text-center"
        style={{
          background: 'var(--color-panel)',
          boxShadow: '0 20px 60px rgba(40,30,15,0.35), 0 0 0 1px rgba(60,50,35,0.08)',
        }}
      >
        <img
          src={winnerFish.src}
          alt=""
          aria-hidden
          className="pointer-events-none absolute"
          style={{ right: -40, top: -12, width: 170, opacity: 0.18 }}
        />
        <div className="relative mb-2 flex items-center justify-center gap-3">
          <img src={winnerFish.src} alt="" aria-hidden style={{ width: 56, height: 'auto' }} />
          <h2 className="font-heading font-bold leading-none" style={{ fontSize: 40, color: winnerFish.deep }}>
            Игра окончена
          </h2>
        </div>
        <p className="relative text-base text-ink-soft">
          Победитель —{' '}
          <span className="font-heading font-bold" style={{ color: winnerFish.deep, fontSize: 22 }}>
            {winner.name}
          </span>{' '}
          <span className="font-heading font-bold tabular-nums" style={{ color: winnerFish.deep, fontSize: 22 }}>
            ({winner.score})
          </span>
        </p>

        <ol className="relative mt-5 space-y-1.5">
          {sorted.map((p, i) => {
            const fish = fishForSlot(p.slot);
            return (
              <li
                key={p.slot}
                className="flex items-center justify-between rounded-xl px-3 py-2"
                style={{
                  background: i === 0 ? `${fish.soft}66` : 'rgba(255,255,255,0.4)',
                  boxShadow: i === 0 ? `inset 0 0 0 2px ${fish.accent}` : 'none',
                }}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="font-heading w-5 text-center font-bold"
                    style={{ color: 'var(--color-ink-soft)' }}
                  >
                    {i + 1}.
                  </span>
                  <img src={fish.src} alt="" aria-hidden style={{ width: 28, height: 'auto' }} />
                  <span className="font-heading font-bold" style={{ fontSize: 20, color: fish.deep }}>
                    {p.name}
                  </span>
                </span>
                <span
                  className="font-heading font-bold tabular-nums"
                  style={{ fontSize: 24, color: fish.deep }}
                >
                  {p.score}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="relative mt-6 flex justify-center gap-3">
          <button
            type="button"
            className="font-heading rounded-full px-5 py-2.5 text-base font-semibold text-white shadow"
            style={{ background: 'var(--color-accent)' }}
            onClick={() => sendNewGame()}
          >
            Новая игра
          </button>
          <a
            href="#past"
            className="rounded-full bg-ink/10 px-5 py-2.5 text-sm hover:bg-ink/20"
          >
            К списку игр
          </a>
        </div>
      </div>
    </div>
  );
}
