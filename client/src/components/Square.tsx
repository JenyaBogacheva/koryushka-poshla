import { useDroppable } from '@dnd-kit/core';
import type { Cell, Premium, Tile as TileT } from '@shared/types';
import { Tile } from './Tile.js';
import { useGameStore } from '../store.js';

const PREMIUM_BG: Record<Exclude<Premium, null>, string> = {
  TW: 'bg-terracotta/70',
  DW: 'bg-peach',
  TL: 'bg-sage',
  DL: 'bg-sage-light',
  CENTER: 'bg-peach',
};

const PREMIUM_LABEL: Record<Exclude<Premium, null>, string> = {
  TW: '3W',
  DW: '2W',
  TL: '3L',
  DL: '2L',
  CENTER: '★',
};

type Props = {
  row: number;
  col: number;
  cell: Cell | null;
  premium: Premium;
  size: number;
};

export function Square({ row, col, cell, premium, size }: Props) {
  const mySlot = useGameStore((s) => s.mySlot);
  const state = useGameStore((s) => s.state);
  const pending = useGameStore((s) => s.pendingPlacements);
  const removePending = useGameStore((s) => s.removePending);

  const pendingHere = pending.find((p) => p.row === row && p.col === col) ?? null;
  const isMyTurn = state !== null && mySlot !== null && state.turnIndex === mySlot && state.phase === 'playing';
  const canDrop = cell === null && pendingHere === null && isMyTurn;

  const { setNodeRef, isOver } = useDroppable({ id: `sq-${row}-${col}`, disabled: !canDrop });

  const base = 'relative flex items-center justify-center border border-ink/10';
  const bg = cell ? 'bg-bg' : (premium ? PREMIUM_BG[premium] : 'bg-bg');
  const overRing = isOver ? 'outline outline-2 outline-sage' : '';

  let pendingTile: TileT | null = null;
  if (pendingHere !== null && state !== null && mySlot !== null) {
    pendingTile = state.players[mySlot]!.rack.find((t) => t.id === pendingHere.tileId) ?? null;
  }

  return (
    <div
      ref={setNodeRef}
      className={`${base} ${bg} ${overRing}`}
      style={{ width: size, height: size }}
    >
      {cell ? (
        <Tile cell={cell} size={size - 4} />
      ) : pendingTile !== null ? (
        <button
          onClick={() => pendingHere && removePending(pendingHere.tileId)}
          className="contents"
          aria-label="Recall tile"
        >
          <Tile tile={pendingTile} size={size - 4} ghost />
        </button>
      ) : premium ? (
        <span className="text-[10px] font-medium text-ink/60">{PREMIUM_LABEL[premium]}</span>
      ) : null}
    </div>
  );
}
