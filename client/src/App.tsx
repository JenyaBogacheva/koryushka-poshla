import { useEffect, useState, type ReactNode } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import type { Letter, Slot, Tile as TileT } from '@shared/types';
import { useGameStore } from './store.js';
import { connect, disconnect, sendJoin, sendClaimBlank } from './ws.js';
import { Board } from './components/Board.js';
import { PlayerCard } from './components/PlayerCard.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import { SlotPicker } from './components/SlotPicker.js';
import { LetterPicker } from './components/LetterPicker.js';
import { WaitingRoom } from './components/WaitingRoom.js';
import { ActionBar } from './components/ActionBar.js';
import { MoveLog } from './components/MoveLog.js';
import { CYRILLIC_LETTERS } from './letters.js';

type PendingDrop = { tile: TileT; row: number; col: number };

export function App() {
  const state = useGameStore((s) => s.state);
  const lobby = useGameStore((s) => s.lobby);
  const identity = useGameStore((s) => s.identity);
  const connected = useGameStore((s) => s.connected);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const addPending = useGameStore((s) => s.addPending);
  const removePending = useGameStore((s) => s.removePending);
  const pendingPlacements = useGameStore((s) => s.pendingPlacements);

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
    const tileId = String(ev.active.id);
    const isPending = pendingPlacements.some((p) => p.tileId === tileId);

    // Dropped outside any square: recall to rack if it was a pending placement.
    if (ev.over === null) {
      if (isPending) removePending(tileId);
      return;
    }
    const m = /^sq-(\d+)-(\d+)$/.exec(String(ev.over.id));
    if (m === null) return;
    const row = Number(m[1]);
    const col = Number(m[2]);
    const tile = findRackTile(tileId);
    if (tile === null) return;

    // Claim-blank: dropped onto a square already occupied by a blank tile.
    const cell = state?.board[row]?.[col] ?? null;
    if (cell !== null) {
      const myTurn = identity !== null && state?.turnIndex === identity.slot;
      if (myTurn && cell.fromBlank && !tile.isBlank && tile.letter === cell.playedAs) {
        sendClaimBlank(row, col, tile.id);
      }
      return;
    }

    // Moving an already-placed pending tile — keep the chosen playedAs (no blank re-prompt).
    const existing = pendingPlacements.find((p) => p.tileId === tileId);
    if (existing !== undefined) {
      addPending({ tileId, row, col, playedAs: existing.playedAs });
      return;
    }

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
  if (state.phase === 'waiting') {
    return <WaitingRoom players={state.players} mySlot={identity.slot} />;
  }

  return (
    <DndContext onDragEnd={onDragEnd}>
      <main className="flex h-full items-start justify-center gap-8 p-8">
        <div>
          <Board board={state.board} />
          <ErrorBanner />
        </div>
        <aside className="flex h-full w-72 flex-col gap-3">
          <header className="text-sm uppercase tracking-wide text-ink/60">
            {state.phase === 'finished' ? 'Game over' : `${state.players[state.turnIndex]?.name ?? '—'}'s turn`}
          </header>
          {state.players.map((p) => (
            <PlayerCard key={p.slot} player={p} isCurrentTurn={p.slot === state.turnIndex && state.phase === 'playing'} />
          ))}
          <ActionBar />
          <MoveLog state={state} />
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
