import type { ReactNode } from 'react';
import { useGameStore } from './store.js';

export function App() {
  const state = useGameStore((s) => s.state);
  const connected = useGameStore((s) => s.connected);

  if (!connected) return <Center>connecting…</Center>;
  if (!state) return <Center>waiting for state…</Center>;

  const turnName = state.players[state.turnIndex]?.name ?? '—';
  return (
    <Center>
      <p className="text-xl">phase: {state.phase}</p>
      <p className="text-xl">turn: {turnName}</p>
      <p className="text-xl">history: {state.history.length} moves</p>
    </Center>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <main className="flex h-full flex-col items-center justify-center gap-2 text-ink">{children}</main>;
}
