import type { ReactNode } from 'react';
import { useGameStore } from './store.js';
import { Board } from './components/Board.js';
import { PlayerCard } from './components/PlayerCard.js';

export function App() {
  const state = useGameStore((s) => s.state);
  const connected = useGameStore((s) => s.connected);

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
