import { useDroppable } from '@dnd-kit/core';
import type { Cell, Premium, Tile as TileT } from '@shared/types';
import { Tile } from './Tile.js';
import { useGameStore } from '../store.js';
import { SUBSTITUTIONS, canSubstitute } from '../letters.js';

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
  readOnly?: boolean;
};

export function Square({ row, col, cell, premium, size, readOnly = false }: Props) {
  const identity = useGameStore((s) => s.identity);
  const state = useGameStore((s) => s.state);
  const pending = useGameStore((s) => s.pendingPlacements);
  const removePending = useGameStore((s) => s.removePending);
  const togglePendingSubstitution = useGameStore((s) => s.togglePendingSubstitution);

  const mySlot = identity?.slot ?? null;
  const pendingHere = readOnly ? null : (pending.find((p) => p.row === row && p.col === col) ?? null);
  const isMyTurn = !readOnly && state !== null && mySlot !== null && state.turnIndex === mySlot && state.phase === 'playing';
  const isClaimBlankTarget = cell !== null && cell.fromBlank && isMyTurn;
  const canDrop = !readOnly && ((cell === null && pendingHere === null && isMyTurn) || isClaimBlankTarget);

  const { setNodeRef, isOver } = useDroppable({ id: `sq-${row}-${col}`, disabled: !canDrop });

  const base = 'relative flex items-center justify-center border border-ink/10';
  const bg = cell ? 'bg-bg' : (premium ? PREMIUM_BG[premium] : 'bg-bg');
  const overRing = isOver
    ? (isClaimBlankTarget ? 'outline outline-2 outline-emerald-500' : 'outline outline-2 outline-sage')
    : '';

  let pendingTile: TileT | null = null;
  if (pendingHere !== null && state !== null && mySlot !== null) {
    pendingTile = state.players[mySlot]!.rack.find((t) => t.id === pendingHere.tileId) ?? null;
  }

  const subBadge =
    pendingTile !== null && pendingHere !== null && !pendingTile.isBlank && canSubstitute(pendingTile.letter)
      ? {
          display:
            pendingHere.playedAs === pendingTile.letter
              ? SUBSTITUTIONS[pendingTile.letter]!
              : pendingTile.letter,
          onClick: () =>
            togglePendingSubstitution(pendingTile.id, pendingTile.letter, SUBSTITUTIONS[pendingTile.letter]!),
        }
      : undefined;

  return (
    <div
      ref={setNodeRef}
      className={`${base} ${bg} ${overRing}`}
      style={{ width: size, height: size }}
    >
      {cell ? (
        <Tile cell={cell} size={size - 4} />
      ) : pendingTile !== null && pendingHere !== null ? (
        <div
          onDoubleClick={() => removePending(pendingHere.tileId)}
          title="Перетащи или дважды кликни, чтобы убрать"
        >
          <Tile
            tile={pendingTile}
            size={size - 4}
            ghost
            draggableId={isMyTurn ? pendingTile.id : undefined}
            displayOverride={pendingHere.playedAs}
            subBadge={subBadge}
          />
        </div>
      ) : premium ? (
        <span className="text-[10px] font-medium text-ink/60">{PREMIUM_LABEL[premium]}</span>
      ) : null}
    </div>
  );
}
