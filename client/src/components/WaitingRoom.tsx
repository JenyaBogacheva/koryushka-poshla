import type { Player } from '@shared/types';
import { fishForSlot } from '../fish.js';

type Props = { players: readonly Player[]; mySlot: number };

export function WaitingRoom({ players, mySlot }: Props) {
  const onlineCount = players.filter((p) => p.connected).length;
  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 p-8 text-ink">
      <header className="flex items-center gap-5">
        <img
          src="/fish/solid-teal.png"
          alt=""
          aria-hidden
          className="fish-walk-big"
          style={{ width: 110, height: 'auto' }}
        />
        <div>
          <h1 className="font-heading font-bold leading-[0.9] tracking-tight" style={{ fontSize: 56 }}>
            Ждём игроков
          </h1>
          <p className="mt-1.5 text-sm italic text-ink-soft">{onlineCount} / 3 готовы</p>
        </div>
      </header>

      <div className="flex w-full max-w-md flex-col gap-3">
        {players.map((p) => {
          const fish = fishForSlot(p.slot);
          return (
            <div
              key={p.slot}
              className="relative flex items-center gap-4 overflow-hidden rounded-2xl px-5 py-4"
              style={{
                background: p.connected
                  ? `linear-gradient(135deg, ${fish.soft} 0%, var(--color-panel) 80%)`
                  : 'var(--color-panel)',
                boxShadow: p.connected
                  ? `0 4px 14px ${fish.accent}28, 0 0 0 2px ${fish.accent} inset`
                  : '0 2px 0 rgba(60,50,35,0.06), 0 6px 18px rgba(60,50,35,0.08)',
                opacity: p.connected ? 1 : 0.7,
              }}
            >
              <img
                src={fish.src}
                alt=""
                aria-hidden
                className="pointer-events-none absolute"
                style={{ right: -32, top: -8, width: 130, opacity: p.connected ? 0.22 : 0.08 }}
              />
              <img
                src={fish.src}
                alt=""
                aria-hidden
                className="relative shrink-0"
                style={{ width: 52, height: 'auto', filter: p.connected ? 'none' : 'grayscale(0.4)' }}
              />
              <span
                className="font-heading relative flex-1 font-bold leading-none"
                style={{ fontSize: 28, color: fish.deep }}
              >
                {p.name}
                {p.slot === mySlot && (
                  <span
                    className="ml-2 inline-flex items-center rounded px-1.5 leading-none align-middle text-sm font-bold uppercase tracking-wider text-white"
                    style={{ background: fish.accent, height: 16 }}
                  >
                    ты
                  </span>
                )}
              </span>
              <span
                className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold uppercase tracking-wider"
                style={{
                  background: p.connected ? 'rgba(255,255,255,0.45)' : 'rgba(45,36,25,0.06)',
                  color: p.connected ? fish.deep : 'var(--color-ink-soft)',
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.connected ? fish.accent : 'rgba(45,36,25,0.3)' }}
                />
                {p.connected ? 'онлайн' : 'ждём'}
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
