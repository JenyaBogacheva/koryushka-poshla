import type { Slot, Tile as TileT } from '@shared/types';
import { Tile } from './Tile.js';
import { useGameStore } from '../store.js';

const RACK_SIZE = 7;
const TILE_SIZE = 32;

type Props = { slot: Slot; tiles: TileT[] };

export function Rack({ slot, tiles }: Props) {
  const identity = useGameStore((s) => s.identity);
  const turnIndex = useGameStore((s) => s.state?.turnIndex);
  const pending = useGameStore((s) => s.pendingPlacements);

  const pendingIds = new Set(pending.map((p) => p.tileId));
  const isMine = identity?.slot === slot;
  const myTurn = turnIndex === slot;
  const canDrag = isMine && myTurn;

  // Hide tiles that are currently staged on the board.
  const visible = tiles.filter((t) => !pendingIds.has(t.id));
  const slots: (TileT | null)[] = Array.from({ length: RACK_SIZE }, (_, i) => visible[i] ?? null);

  return (
    <div className="flex gap-1 rounded-md bg-ink/10 p-1">
      {slots.map((t, i) => (
        <div
          key={i}
          className="flex items-center justify-center rounded bg-bg/50"
          style={{ width: TILE_SIZE, height: TILE_SIZE }}
        >
          {t ? (
            <Tile
              tile={t}
              size={TILE_SIZE - 4}
              draggableId={canDrag ? t.id : undefined}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
