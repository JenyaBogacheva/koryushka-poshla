import type { Cell, Tile as TileT } from '@shared/types';

type Props = {
  /** Cell-mode (board): pass a cell to render the tile as it sits on the board. */
  cell?: Cell;
  /** Rack-mode: pass a raw tile. */
  tile?: TileT;
  /** Pixel size of the tile square. Default 36. */
  size?: number;
};

export function Tile({ cell, tile, size = 36 }: Props) {
  const t = cell?.tile ?? tile;
  if (!t) return null;
  const display = cell ? cell.playedAs : (t.isBlank ? '' : t.letter);
  const points = cell ? (cell.fromBlank ? 0 : t.points) : t.points;

  return (
    <div
      className="relative flex items-center justify-center rounded-md bg-tile shadow-sm font-semibold select-none"
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
