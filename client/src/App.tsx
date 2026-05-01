import { useEffect, useState, type ReactNode } from 'react';
import type { Slot } from '@shared/types';
import { useGameStore } from './store.js';
import { connect } from './ws.js';
import { Board } from './components/Board.js';
import { PlayerCard } from './components/PlayerCard.js';
import { MissingParams } from './MissingParams.js';

const VALID_SLOTS = new Set(['0', '1', '2']);

export function App() {
  const setIdentity = useGameStore((s) => s.setIdentity);
  const state = useGameStore((s) => s.state);
  const connected = useGameStore((s) => s.connected);
  const [bad, setBad] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slotStr = params.get('slot');
    const name = params.get('name')?.trim();
    if (slotStr === null || !VALID_SLOTS.has(slotStr) || !name) {
      setBad(true);
      return;
    }
    const slot = Number(slotStr) as Slot;
    setIdentity(slot, name);
    connect();
    setReady(true);
  }, [setIdentity]);

  if (bad) return <MissingParams />;
  if (!ready) return null;
  if (!connected) return <Center>connecting…</Center>;
  if (!state) return <Center>waiting for state…</Center>;

  return (
    <main className="flex h-full items-start justify-center gap-8 p-8">
      <Board board={state.board} />
      <aside className="flex w-72 flex-col gap-3">
        <header className="text-sm uppercase tracking-wide text-ink/60">
          {state.phase === 'finished' ? 'Game over' : `${state.players[state.turnIndex]?.name ?? '—'}'s turn`}
        </header>
        {state.players.map((p) => (
          <PlayerCard key={p.slot} player={p} isCurrentTurn={p.slot === state.turnIndex && state.phase === 'playing'} />
        ))}
      </aside>
    </main>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <main className="flex h-full items-center justify-center text-ink">{children}</main>;
}
