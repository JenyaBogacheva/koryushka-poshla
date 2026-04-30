import type { ReactNode } from 'react';
import { useGameStore } from './store.js';
import { Board } from './components/Board.js';

export function App() {
  const state = useGameStore((s) => s.state);
  const connected = useGameStore((s) => s.connected);

  if (!connected) return <Center>connecting…</Center>;
  if (!state) return <Center>waiting for state…</Center>;

  return (
    <main className="flex h-full items-start justify-center gap-8 p-8">
      <Board board={state.board} />
      <aside className="w-64">
        <p className="text-sm uppercase tracking-wide text-ink/60">Phase</p>
        <p className="mb-4 text-lg">{state.phase}</p>
        <p className="text-sm uppercase tracking-wide text-ink/60">Turn</p>
        <p className="text-lg">{state.players[state.turnIndex]?.name ?? '—'}</p>
      </aside>
    </main>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <main className="flex h-full items-center justify-center text-ink">{children}</main>;
}
