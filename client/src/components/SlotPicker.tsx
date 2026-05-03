import { useState } from 'react';
import type { LobbySlot, Slot } from '@shared/types';
import { useGameStore } from '../store.js';
import { fishForSlot } from '../fish.js';

type Props = {
  lobby: LobbySlot[] | null;
  onJoin: (slot: Slot, name: string, password: string) => void;
};

export function SlotPicker({ lobby, onJoin }: Props) {
  const lastError = useGameStore((s) => s.lastError);
  const [password, setPassword] = useState('');

  if (lobby === null) {
    return <main className="flex h-full items-center justify-center text-ink">Подключение…</main>;
  }
  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 p-8 text-ink">
      {/* Title */}
      <header className="flex items-center gap-5">
        <img
          src="/fish/solid-yellow.png"
          alt=""
          aria-hidden
          className="fish-walk-big"
          style={{ width: 110, height: 'auto' }}
        />
        <div>
          <h1 className="font-heading font-bold leading-[0.9] tracking-tight" style={{ fontSize: 56 }}>
            Корюшка пошла
          </h1>
          <p className="mt-1.5 text-sm italic text-ink-soft">Введи пароль и выбери себя</p>
        </div>
      </header>

      {lastError !== null && (
        <div
          className="w-full max-w-md rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'rgba(177,77,44,0.12)',
            color: 'var(--color-accent)',
            boxShadow: 'inset 0 0 0 1px rgba(177,77,44,0.35)',
          }}
        >
          {lastError}
        </div>
      )}

      <input
        type="password"
        className="w-full max-w-md rounded-full px-5 py-3 text-base outline-none transition-shadow"
        placeholder="пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          background: 'var(--color-cell)',
          color: 'var(--color-ink)',
          boxShadow: 'inset 0 0 0 2px rgba(60,50,35,0.12), 0 1px 0 rgba(60,50,35,0.04)',
        }}
      />

      <div className="flex w-full max-w-md flex-col gap-3">
        {lobby.map((s) => {
          const taken = s.connected;
          const fish = fishForSlot(s.slot);
          const disabled = taken || password === '';
          return (
            <button
              key={s.slot}
              type="button"
              disabled={disabled}
              onClick={() => onJoin(s.slot, s.name, password)}
              className="relative flex items-center gap-4 overflow-hidden rounded-2xl px-5 py-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:-translate-y-0.5"
              style={{
                background: `linear-gradient(135deg, ${fish.soft} 0%, var(--color-panel) 80%)`,
                boxShadow: `0 4px 14px ${fish.accent}28, 0 0 0 2px ${fish.accent} inset`,
              }}
            >
              {/* Watermark fish */}
              <img
                src={fish.src}
                alt=""
                aria-hidden
                className="pointer-events-none absolute"
                style={{ right: -32, top: -8, width: 130, opacity: 0.22 }}
              />
              {/* Foreground fish */}
              <img
                src={fish.src}
                alt=""
                aria-hidden
                className="relative shrink-0"
                style={{ width: 56, height: 'auto' }}
              />
              <span
                className="font-heading relative flex-1 font-bold leading-none"
                style={{ fontSize: 32, color: fish.deep }}
              >
                {s.name}
              </span>
              {taken && (
                <span
                  className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ background: 'rgba(255,255,255,0.45)', color: fish.deep }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: fish.accent }}
                  />
                  онлайн
                </span>
              )}
            </button>
          );
        })}
      </div>
    </main>
  );
}
