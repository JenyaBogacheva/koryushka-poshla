import { useDraggable } from '@dnd-kit/core';
import type { Cell, Tile as TileT } from '@shared/types';

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
};

export function Tile({ cell, tile, size = 36, draggableId, ghost = false }: Props) {
  const t = cell?.tile ?? tile;
  if (!t) return null;
  const display = cell ? cell.playedAs : (t.isBlank ? '★' : t.letter);
  const points = cell ? (cell.fromBlank ? 0 : t.points) : t.points;

  if (draggableId !== undefined) {
    return <DraggableTile id={draggableId} display={display} points={points} size={size} ghost={ghost} />;
  }
  return <StaticTile display={display} points={points} size={size} ghost={ghost} />;
}

function StaticTile({ display, points, size, ghost }: { display: string; points: number; size: number; ghost: boolean }) {
  return (
    <div
      className={[
        'relative flex items-center justify-center rounded-md bg-tile shadow-sm font-semibold select-none',
        ghost ? 'opacity-70 ring-2 ring-terracotta' : '',
      ].join(' ')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      <span>{display}</span>
      <span
        className="absolute right-0.5 bottom-0 text-ink/70"
        style={{ fontSize: Math.round(size * 0.25) }}
      >
        {points}
      </span>
    </div>
  );
}

function DraggableTile({ id, display, points, size, ghost }: { id: string; display: string; points: number; size: number; ghost: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.5),
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
        'relative flex items-center justify-center rounded-md bg-tile shadow-sm font-semibold select-none',
        ghost ? 'opacity-70 ring-2 ring-terracotta' : '',
      ].join(' ')}
    >
      <span>{display}</span>
      <span
        className="absolute right-0.5 bottom-0 text-ink/70"
        style={{ fontSize: Math.round(size * 0.25) }}
      >
        {points}
      </span>
    </div>
  );
}
