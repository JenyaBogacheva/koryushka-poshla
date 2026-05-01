import { useEffect, useState, type ReactNode } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import type { Letter, Slot, Tile as TileT } from '@shared/types';
import { useGameStore } from './store.js';
import { connect, disconnect, sendJoin } from './ws.js';
import { Board } from './components/Board.js';
import { PlayerCard } from './components/PlayerCard.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import { SlotPicker } from './components/SlotPicker.js';
import { LetterPicker } from './components/LetterPicker.js';
import { CYRILLIC_LETTERS } from './letters.js';

type PendingDrop = { tile: TileT; row: number; col: number };

export function App() {
  const state = useGameStore((s) => s.state);
  const lobby = useGameStore((s) => s.lobby);
  const identity = useGameStore((s) => s.identity);
  const connected = useGameStore((s) => s.connected);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const addPending = useGameStore((s) => s.addPending);

  const [pendingBlank, setPendingBlank] = useState<PendingDrop | null>(null);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  function handleJoin(slot: Slot, name: string, password: string) {
    setIdentity(slot, name, password);
    sendJoin(slot, name, password);
  }

  function findRackTile(tileId: string): TileT | null {
    if (state === null || identity === null) return null;
    const rack = state.players[identity.slot]?.rack ?? [];
    return rack.find((t) => t.id === tileId) ?? null;
  }

  function onDragEnd(ev: DragEndEvent) {
    if (ev.over === null) return;
    const tileId = String(ev.active.id);
    const m = /^sq-(\d+)-(\d+)$/.exec(String(ev.over.id));
    if (m === null) return;
    const row = Number(m[1]);
    const col = Number(m[2]);
    const tile = findRackTile(tileId);
    if (tile === null) return;
    if (tile.isBlank) {
      setPendingBlank({ tile, row, col });
      return;
    }
    addPending({ tileId, row, col, playedAs: tile.letter });
  }

  function commitBlank(letter: Letter) {
    if (pendingBlank === null) return;
    addPending({
      tileId: pendingBlank.tile.id,
      row: pendingBlank.row,
      col: pendingBlank.col,
      playedAs: letter,
    });
    setPendingBlank(null);
  }

  if (!connected) return <Center>connecting…</Center>;
  if (identity === null) {
    return <SlotPicker lobby={lobby} onJoin={handleJoin} />;
  }
  if (state === null) return <Center>joining…</Center>;

  return (
    <DndContext onDragEnd={onDragEnd}>
      <main className="flex h-full items-start justify-center gap-8 p-8">
        <div>
          <Board board={state.board} />
          <ErrorBanner />
        </div>
        <aside className="flex w-72 flex-col gap-3">
          <header className="text-sm uppercase tracking-wide text-ink/60">
            {state.phase === 'finished' ? 'Game over' : `${state.players[state.turnIndex]?.name ?? '—'}'s turn`}
          </header>
          {state.players.map((p) => (
            <PlayerCard key={p.slot} player={p} isCurrentTurn={p.slot === state.turnIndex && state.phase === 'playing'} />
          ))}
        </aside>
      </main>
      {pendingBlank !== null && (
        <LetterPicker
          title="Выбери букву для бланка"
          letters={CYRILLIC_LETTERS}
          onPick={commitBlank}
          onCancel={() => setPendingBlank(null)}
        />
      )}
    </DndContext>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <main className="flex h-full items-center justify-center text-ink">{children}</main>;
}
