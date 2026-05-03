import { useDraggable } from '@dnd-kit/core';
import type { Cell, Letter, Tile as TileT } from '@shared/types';

type Props = {
  /** Cell-mode (board): pass a cell to render the tile as it sits on the board. */
  cell?: Cell;
  /** Rack-mode: pass a raw tile. */
  tile?: TileT;
  /** Pixel size of the tile square. Default 36. */
  size?: number;
  /** When set, the tile becomes a dnd-kit draggable with this id. */
  draggableId?: string;
  /** Render with a "pending placement" outline. */
  ghost?: boolean;
  /** Optional substitution badge for pending placements (Ё/Ъ/Ш/Й). */
  subBadge?: { display: Letter; onClick: () => void };
  /** Override the displayed letter (used for pending placements where playedAs differs). */
  displayOverride?: Letter;
  /** Override the displayed points (used when playedAs differs from the rack tile). */
  pointsOverride?: number;
};

type InnerProps = {
  display: string;
  points: number;
  size: number;
  ghost: boolean;
  subBadge?: { display: Letter; onClick: () => void };
};

export function Tile({ cell, tile, size = 36, draggableId, ghost = false, subBadge, displayOverride, pointsOverride }: Props) {
  const t = cell?.tile ?? tile;
  if (!t) return null;
  const display = cell
    ? cell.playedAs
    : (displayOverride ?? (t.isBlank ? '★' : t.letter));
  const points = pointsOverride ?? (cell ? (cell.fromBlank ? 0 : t.points) : t.points);

  if (draggableId !== undefined) {
    return <DraggableTile id={draggableId} display={display} points={points} size={size} ghost={ghost} subBadge={subBadge} />;
  }
  return <StaticTile display={display} points={points} size={size} ghost={ghost} subBadge={subBadge} />;
}

function Badge({ subBadge }: { subBadge: NonNullable<InnerProps['subBadge']> }) {
  return (
    <button
      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white shadow"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        subBadge.onClick();
      }}
      title="Сменить букву"
    >
      {subBadge.display}
    </button>
  );
}

const TILE_BASE =
  'relative flex items-center justify-center rounded-md bg-tile font-heading font-bold select-none';
const TILE_SHADOW =
  'shadow-[0_1px_0_rgba(40,60,75,0.06),0_2px_5px_rgba(40,60,75,0.10),inset_0_0_0_1px_rgba(255,255,255,0.7)]';

function StaticTile({ display, points, size, ghost, subBadge }: InnerProps) {
  return (
    <div
      className={[
        TILE_BASE,
        ghost ? 'opacity-85 outline outline-2 outline-accent -outline-offset-2' : TILE_SHADOW,
      ].join(' ')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55), color: '#1f2a30' }}
    >
      <span style={{ lineHeight: 1, marginTop: -2 }}>{display}</span>
      <span
        className="absolute font-sans font-medium opacity-65"
        style={{
          right: Math.round(size * 0.10),
          bottom: Math.round(size * 0.02),
          fontSize: Math.round(size * 0.26),
        }}
      >
        {points}
      </span>
      {subBadge && <Badge subBadge={subBadge} />}
    </div>
  );
}

function DraggableTile({ id, display, points, size, ghost, subBadge }: InnerProps & { id: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.55),
    color: '#1f2a30',
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab',
    touchAction: 'none',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        TILE_BASE,
        ghost ? 'outline outline-2 outline-accent -outline-offset-2' : TILE_SHADOW,
      ].join(' ')}
    >
      <span style={{ lineHeight: 1, marginTop: -2 }}>{display}</span>
      <span
        className="absolute font-sans font-medium opacity-65"
        style={{
          right: Math.round(size * 0.10),
          bottom: Math.round(size * 0.02),
          fontSize: Math.round(size * 0.26),
        }}
      >
        {points}
      </span>
      {subBadge && <Badge subBadge={subBadge} />}
    </div>
  );
}
