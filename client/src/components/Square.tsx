import { useDroppable } from '@dnd-kit/core';
import type { Cell, Premium, Tile as TileT } from '@shared/types';
import { Tile } from './Tile.js';
import { useGameStore } from '../store.js';
import { SUBSTITUTIONS, SUBSTITUTION_POINTS, canSubstitute } from '../letters.js';

// Must match @keyframes tile-flash duration in styles/index.css.
const TILE_FLASH_MS = 1400;

const PREMIUM_BG: Record<Exclude<Premium, null>, string> = {
  TW: 'bg-prem-tw',
  DW: 'bg-prem-dw',
  TL: 'bg-prem-tl',
  DL: 'bg-prem-dl',
  CENTER: 'bg-prem-dw',
};

const PREMIUM_LABEL: Record<Exclude<Premium, null>, string> = {
  TW: 'С×3',
  DW: 'С×2',
  TL: 'Б×3',
  DL: 'Б×2',
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
  const lastPlacedCells = useGameStore((s) => s.lastPlacedCells);
  const lastPlacedAt = useGameStore((s) => s.lastPlacedAt);

  const mySlot = identity?.slot ?? null;
  const pendingHere = readOnly ? null : (pending.find((p) => p.row === row && p.col === col) ?? null);
  const isMyTurn = !readOnly && state !== null && mySlot !== null && state.turnIndex === mySlot && state.phase === 'playing';
  const isClaimBlankTarget = cell !== null && cell.fromBlank && isMyTurn;
  const canDrop = !readOnly && ((cell === null && pendingHere === null && isMyTurn) || isClaimBlankTarget);

  const { setNodeRef, isOver } = useDroppable({ id: `sq-${row}-${col}`, disabled: !canDrop });

  const isLastPlaced = cell !== null && Date.now() - lastPlacedAt < TILE_FLASH_MS &&
    lastPlacedCells.some((c) => c.row === row && c.col === col);

  const base = 'relative flex items-center justify-center border border-ink/10';
  const bg = cell ? 'bg-cell' : (premium ? PREMIUM_BG[premium] : 'bg-cell');
  const overRing = isOver
    ? (isClaimBlankTarget ? 'outline outline-2 outline-emerald-500' : 'outline outline-2 outline-prem-tl')
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
        <div key={isLastPlaced ? lastPlacedAt : 'static'} className={isLastPlaced ? 'tile-flash' : undefined}>
          <Tile cell={cell} size={size - 4} />
        </div>
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
            pointsOverride={
              pendingHere.playedAs !== pendingTile.letter
                ? (SUBSTITUTION_POINTS[pendingHere.playedAs] ?? pendingTile.points)
                : undefined
            }
            subBadge={subBadge}
          />
        </div>
      ) : premium ? (
        <span className="text-[11px] font-medium text-ink/55 tracking-wide">{PREMIUM_LABEL[premium]}</span>
      ) : null}
    </div>
  );
}
