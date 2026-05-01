import { useState } from 'react';
import type { LobbySlot, Slot } from '@shared/types';
import { useGameStore } from '../store.js';

type Props = {
  lobby: LobbySlot[] | null;
  onJoin: (slot: Slot, name: string, password: string) => void;
};

export function SlotPicker({ lobby, onJoin }: Props) {
  const lastError = useGameStore((s) => s.lastError);
  const [password, setPassword] = useState('');

  if (lobby === null) {
    return <main className="flex h-full items-center justify-center text-ink">connecting…</main>;
  }
  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 p-8 text-ink">
      <h1 className="text-2xl font-semibold">Корюшка пошла</h1>
      <p className="text-sm text-ink/60">Введи пароль и выбери себя</p>
      {lastError !== null && (
        <div className="w-full max-w-md rounded border border-terracotta/60 bg-terracotta/20 px-3 py-2 text-sm">
          {lastError}
        </div>
      )}
      <input
        type="password"
        className="w-full max-w-md rounded border border-ink/20 bg-bg px-3 py-2 text-sm"
        placeholder="пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex w-full max-w-md flex-col gap-3">
        {lobby.map((s) => {
          const taken = s.connected;
          return (
            <button
              key={s.slot}
              className="flex items-center justify-between rounded border border-ink/20 bg-tile px-3 py-3 text-base font-semibold disabled:opacity-50"
              disabled={taken || password === ''}
              onClick={() => onJoin(s.slot, s.name, password)}
            >
              <span>{s.name}</span>
              {taken && <span className="text-xs font-normal text-ink/60">онлайн</span>}
            </button>
          );
        })}
      </div>
    </main>
  );
}
