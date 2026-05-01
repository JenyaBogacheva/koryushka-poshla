import type { Tile as TileT } from '@shared/types';
import { Tile } from './Tile.js';

const RACK_SIZE = 7;
const TILE_SIZE = 32;

type Props = { tiles: TileT[] };

export function Rack({ tiles }: Props) {
  const slots: (TileT | null)[] = Array.from({ length: RACK_SIZE }, (_, i) => tiles[i] ?? null);
  return (
    <div className="flex gap-1 rounded-md bg-ink/10 p-1">
      {slots.map((t, i) => (
        <div
          key={i}
          className="flex items-center justify-center rounded bg-bg/50"
          style={{ width: TILE_SIZE, height: TILE_SIZE }}
        >
          {t ? <Tile tile={t} size={TILE_SIZE - 4} /> : null}
        </div>
      ))}
    </div>
  );
}
