import { useState } from 'react';
import type { LobbySlot, Slot } from '@shared/types';

type Props = {
  lobby: LobbySlot[] | null;
  onJoin: (slot: Slot, name: string) => void;
};

export function SlotPicker({ lobby, onJoin }: Props) {
  if (lobby === null) {
    return <main className="flex h-full items-center justify-center text-ink">connecting…</main>;
  }
  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 p-8 text-ink">
      <h1 className="text-2xl font-semibold">Корюшка пошла</h1>
      <p className="text-sm text-ink/60">Выбери слот и введи имя</p>
      <div className="flex w-full max-w-md flex-col gap-3">
        {lobby.map((s) => (
          <Row key={s.slot} entry={s} onJoin={onJoin} />
        ))}
      </div>
    </main>
  );
}

function Row({ entry, onJoin }: { entry: LobbySlot; onJoin: (slot: Slot, name: string) => void }) {
  const occupied = entry.name !== '';
  const taken = occupied && entry.connected;
  const [name, setName] = useState(entry.name);
  const trimmed = name.trim();

  return (
    <div className="flex items-center gap-3 rounded border border-ink/20 px-3 py-2">
      <div className="w-16 text-xs uppercase text-ink/60">Слот {entry.slot + 1}</div>
      <div className="flex-1 min-w-0">
        {taken ? (
          <span className="text-sm">{entry.name} (онлайн)</span>
        ) : occupied ? (
          <span className="text-sm">
            {entry.name} <span className="text-ink/50">(отключился)</span>
          </span>
        ) : (
          <span className="text-sm text-ink/50">свободно</span>
        )}
      </div>
      <input
        className="w-32 rounded border border-ink/20 bg-bg px-2 py-1 text-sm disabled:opacity-50"
        type="text"
        placeholder="имя"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={taken}
      />
      <button
        className="rounded bg-terracotta px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        disabled={taken || trimmed === ''}
        onClick={() => onJoin(entry.slot, trimmed)}
      >
        Войти
      </button>
    </div>
  );
}
