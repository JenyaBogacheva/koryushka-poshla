import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import type { Letter, Slot, Tile as TileT } from '@shared/types';
import { useGameStore } from './store.js';
import { connect, disconnect, sendJoin, sendClaimBlank, sendPreviewMove } from './ws.js';
import { Board } from './components/Board.js';
import { PlayerCard } from './components/PlayerCard.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import { SlotPicker } from './components/SlotPicker.js';
import { LetterPicker } from './components/LetterPicker.js';
import { WaitingRoom } from './components/WaitingRoom.js';
import { ActionBar } from './components/ActionBar.js';
import { MoveLog } from './components/MoveLog.js';
import { BagIndicator } from './components/BagIndicator.js';
import { CYRILLIC_LETTERS } from './letters.js';
import { PastGamesList } from './components/PastGamesList.js';
import { PastGamesDetail } from './components/PastGamesDetail.js';
import { FinishedScreen } from './components/FinishedScreen.js';
import { DrawForOrderScreen } from './components/DrawForOrderScreen.js';
import { GameEndCelebration } from './components/GameEndCelebration.js';
import { DrawResultReveal } from './components/DrawResultReveal.js';
import { AnimatePresence } from 'framer-motion';
import { fishForSlot } from './fish.js';

type PendingDrop = { tile: TileT; row: number; col: number };

export function App() {
  const [route, setRoute] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.hash : '',
  );
  useEffect(() => {
    const onChange = (): void => setRoute(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const state = useGameStore((s) => s.state);
  const lobby = useGameStore((s) => s.lobby);
  const identity = useGameStore((s) => s.identity);
  const connected = useGameStore((s) => s.connected);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const addPending = useGameStore((s) => s.addPending);
  const removePending = useGameStore((s) => s.removePending);
  const pendingPlacements = useGameStore((s) => s.pendingPlacements);

  const [pendingBlank, setPendingBlank] = useState<PendingDrop | null>(null);
  const boardSquareSize = useResponsiveBoardSize();

  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);

  const setMovePreview = useGameStore((s) => s.setMovePreview);
  useEffect(() => {
    if (pendingPlacements.length === 0) {
      setMovePreview(null);
      return;
    }
    const t = setTimeout(() => {
      sendPreviewMove(pendingPlacements.map((p) => ({ tileId: p.tileId, row: p.row, col: p.col, playedAs: p.playedAs })));
    }, 120);
    return () => clearTimeout(t);
  }, [pendingPlacements, setMovePreview]);

  const phase = state?.phase;
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const [drawRevealOpen, setDrawRevealOpen] = useState(false);
  const prevPhase = useRef(phase);
  useEffect(() => {
    if (prevPhase.current !== 'finished' && phase === 'finished') {
      setCelebrationOpen(true);
    }
    if (prevPhase.current === 'drawing' && phase === 'playing') {
      setDrawRevealOpen(true);
    }
    prevPhase.current = phase;
  }, [phase]);

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

  if (route === '#past') return <PastGamesList />;
  if (route.startsWith('#past/')) return <PastGamesDetail id={route.slice('#past/'.length)} />;

  if (!connected) return <Center>Подключение…</Center>;
  if (identity === null) {
    return <SlotPicker lobby={lobby} onJoin={handleJoin} />;
  }
  if (state === null) return <Center>Загружаем игру…</Center>;
  if (state.phase === 'waiting') {
    return <WaitingRoom players={state.players} mySlot={identity.slot} />;
  }

  const activeSlot = (state.turnIndex as Slot);
  const activeFish = fishForSlot(activeSlot);
  return (
    <DndContext onDragEnd={onDragEnd}>
      <main className="relative mx-auto grid h-screen max-w-[1400px] items-start gap-6 overflow-hidden px-6 pb-3 pt-10 lg:gap-8 lg:px-10 lg:pt-14" style={{ gridTemplateColumns: '1fr 360px' }}>
        <nav className="absolute right-6 top-3 z-10 flex items-center gap-2 lg:right-10 lg:top-5">
          <a
            href="#past"
            className="inline-flex items-center rounded-full px-3 py-1.5 text-xs text-ink-soft transition-transform hover:-translate-y-0.5 hover:text-ink"
            style={{
              background: 'var(--color-panel)',
              boxShadow: '0 1px 0 rgba(60,50,35,0.06), 0 2px 6px rgba(60,50,35,0.08)',
            }}
          >
            Прошлые игры
          </a>
          <button
            type="button"
            onClick={() => {
              useGameStore.getState().clearIdentity();
              window.location.reload();
            }}
            className="inline-flex items-center rounded-full px-3 py-1.5 text-xs text-ink-soft transition-transform hover:-translate-y-0.5 hover:text-ink"
            style={{
              background: 'var(--color-panel)',
              boxShadow: '0 1px 0 rgba(60,50,35,0.06), 0 2px 6px rgba(60,50,35,0.08)',
            }}
          >
            Выйти
          </button>
        </nav>
        <div className="flex h-full min-h-0 flex-col items-center gap-4">
          {/* Header — walking koryushka in the active player's color + handwritten title */}
          <header className="flex w-full items-center gap-6 self-start" style={{ marginLeft: 6 }}>
            <div className="relative shrink-0" style={{ width: 170, height: 80 }}>
              <img
                key={activeFish.color}
                src={activeFish.src}
                alt=""
                aria-hidden
                className="fish-walk-big absolute"
                style={{ width: 180, left: -8, top: -10 }}
              />
            </div>
            <div className="flex-1">
              <h1 className="font-heading font-bold leading-[0.85] tracking-tight" style={{ fontSize: 48 }}>
                Корюшка пошла
              </h1>
              <p className="mt-2 text-xs italic leading-[1.35] text-ink-soft">
                по первоапрельскому снегу уверенной походкой в светлое будущее.<br />
                А если пошла корюшка, то и мы за ней!
              </p>
            </div>
          </header>
          <Board board={state.board} size={boardSquareSize} />
          <ErrorBanner />
        </div>
        <aside className="flex h-full min-h-0 min-w-0 flex-col gap-3">
          <BagIndicator
            count={state.bag.length}
            nextLetter={(() => {
              const nextTile = state.bag[state.bag.length - 1];
              if (nextTile === undefined) return undefined;
              return nextTile.isBlank ? '★' : nextTile.letter;
            })()}
          />
          {state.players.map((p) => (
            <PlayerCard key={p.slot} player={p} isCurrentTurn={p.slot === state.turnIndex && state.phase === 'playing'} />
          ))}
          <ActionBar />
          <MoveLog state={state} />
        </aside>
        {state.phase === 'finished' && (
          <>
            <FinishedScreen state={state} />
            <AnimatePresence>
              {celebrationOpen && (
                <GameEndCelebration state={state} onDismiss={() => setCelebrationOpen(false)} />
              )}
            </AnimatePresence>
          </>
        )}
        {state.phase === 'drawing' && <DrawForOrderScreen state={state} mySlot={identity.slot} />}
        <AnimatePresence>
          {drawRevealOpen && (() => {
            const lastDraw = [...state.events].reverse().find((e) => e.kind === 'drawForOrder');
            if (lastDraw === undefined || lastDraw.kind !== 'drawForOrder') return null;
            const nameOf = (slot: 0 | 1 | 2): string =>
              state.players[slot]?.name || `Слот ${slot}`;
            return (
              <DrawResultReveal
                ev={lastDraw}
                nameOf={nameOf}
                onDismiss={() => setDrawRevealOpen(false)}
              />
            );
          })()}
        </AnimatePresence>
      </main>
      {pendingBlank !== null && (
        <LetterPicker
          title="Выбери букву"
          letters={CYRILLIC_LETTERS}
          fishSlot={identity.slot}
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

// Board square size that fits the viewport. Reserves vertical space for header,
// padding, ErrorBanner, and bottom margin; caps at 42 (the original size).
function useResponsiveBoardSize(): number {
  const [size, setSize] = useState<number>(() => computeBoardSize());
  useEffect(() => {
    const onResize = (): void => setSize(computeBoardSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function computeBoardSize(): number {
  if (typeof window === 'undefined') return 42;
  const VERTICAL_CHROME = 230; // header + main paddings + ErrorBanner row + breathing room
  const HORIZONTAL_RIGHT_COL = 360 + 80; // aside width + main horizontal padding + gap
  const availableH = window.innerHeight - VERTICAL_CHROME;
  const availableW = window.innerWidth - HORIZONTAL_RIGHT_COL;
  const fromHeight = Math.floor(availableH / 15);
  const fromWidth = Math.floor(availableW / 15);
  return Math.max(24, Math.min(42, fromHeight, fromWidth));
}
