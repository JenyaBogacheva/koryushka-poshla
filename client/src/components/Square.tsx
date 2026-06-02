import { useDroppable } from '@dnd-kit/core';
import type { Cell, Letter, Premium, Slot, Tile as TileT } from '@shared/types';
import { Tile } from './Tile.js';
import { useGameStore } from '../store.js';
import { SUBSTITUTIONS, canSubstitute, substitutionPoints } from '../letters.js';
import { fishForSlot } from '../fish.js';

// Must match @keyframes tile-flash duration in styles/index.css.
const TILE_FLASH_MS = 1400;

// Stable empty reference so the activeDraft selector doesn't churn re-renders
// for squares when there's no active draft to mirror.
const EMPTY_DRAFT: { row: number; col: number; tileId: string; playedAs: Letter }[] = [];

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
  // Only the active player drafts, so mirror just their slice — selecting the
  // whole othersDraft object would re-render all 225 squares on every draft tick.
  const activeDraft = useGameStore((s) => {
    const ti = s.state?.turnIndex;
    const mine = s.identity?.slot ?? null;
    return ti !== undefined && ti !== mine ? s.othersDraft[ti] : EMPTY_DRAFT;
  });
  const togglePendingSubstitution = useGameStore((s) => s.togglePendingSubstitution);
  const lastPlacedCells = useGameStore((s) => s.lastPlacedCells);
  const lastPlacedAt = useGameStore((s) => s.lastPlacedAt);
  const lastPlacedSlot = useGameStore((s) => s.lastPlacedSlot);

  const mySlot = identity?.slot ?? null;
  const pendingHere = readOnly ? null : (pending.find((p) => p.row === row && p.col === col) ?? null);
  const isMyTurn = !readOnly && state !== null && mySlot !== null && state.turnIndex === mySlot && state.phase === 'playing';
  const isClaimBlankTarget = cell !== null && cell.fromBlank && isMyTurn;
  const canDrop = !readOnly && ((cell === null && pendingHere === null && isMyTurn) || isClaimBlankTarget);

  const { setNodeRef, isOver } = useDroppable({ id: `sq-${row}-${col}`, disabled: !canDrop });

  const isLastPlaced = cell !== null && Date.now() - lastPlacedAt < TILE_FLASH_MS &&
    lastPlacedCells.some((c) => c.row === row && c.col === col);

  // Highlights around in-progress work are tinted with the acting player's fish color.
  const myAccent = mySlot !== null ? fishForSlot(mySlot).accent : 'var(--color-accent)';
  const base = 'relative flex items-center justify-center border border-ink/10';
  const bg = cell ? 'bg-cell' : (premium ? PREMIUM_BG[premium] : 'bg-cell');
  const overRing = isOver
    ? (isClaimBlankTarget ? 'outline outline-2 outline-emerald-500' : 'outline outline-2')
    : '';

  let pendingTile: TileT | null = null;
  if (pendingHere !== null && state !== null && mySlot !== null) {
    pendingTile = state.players[mySlot]!.rack.find((t) => t.id === pendingHere.tileId) ?? null;
  }

  // Another player's tentative tile on this square (only the active player drafts,
  // so at most one). Its tile still sits in that player's rack server-side until the
  // move commits, so we resolve the glyph from the broadcast state.
  let otherTile: TileT | null = null;
  let otherDraftHere: { row: number; col: number; tileId: string; playedAs: Letter } | null = null;
  let otherSlot: Slot | null = null;
  if (!readOnly && cell === null && pendingHere === null && state !== null && state.turnIndex !== mySlot) {
    const p = activeDraft.find((x) => x.row === row && x.col === col);
    if (p !== undefined) {
      otherDraftHere = p;
      otherSlot = state.turnIndex as Slot;
      otherTile = state.players[otherSlot]!.rack.find((t) => t.id === p.tileId) ?? null;
    }
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
      style={{ width: size, height: size, outlineColor: isOver && !isClaimBlankTarget ? myAccent : undefined }}
    >
      {cell ? (
        <div
          key={isLastPlaced ? lastPlacedAt : 'static'}
          className={isLastPlaced ? 'tile-flash' : undefined}
          style={
            isLastPlaced && lastPlacedSlot !== null
              ? ({ ['--flash-color']: fishForSlot(lastPlacedSlot).accent } as React.CSSProperties)
              : undefined
          }
        >
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
            outlineColor={myAccent}
            draggableId={isMyTurn ? pendingTile.id : undefined}
            displayOverride={pendingHere.playedAs}
            pointsOverride={substitutionPoints(pendingHere.playedAs, pendingTile)}
            subBadge={subBadge}
          />
        </div>
      ) : otherTile !== null && otherDraftHere !== null && otherSlot !== null ? (
        <div title="Соперник ставит плитку">
          <Tile
            tile={otherTile}
            size={size - 4}
            ghost
            outlineColor={fishForSlot(otherSlot).accent}
            displayOverride={otherDraftHere.playedAs}
            pointsOverride={substitutionPoints(otherDraftHere.playedAs, otherTile)}
          />
        </div>
      ) : premium ? (
        <span className="text-sm font-medium text-ink/55 tracking-wide">{PREMIUM_LABEL[premium]}</span>
      ) : null}
    </div>
  );
}
