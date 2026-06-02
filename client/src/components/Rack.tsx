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
  // Subscribe to just this slot's draft slice — selecting the whole othersDraft
  // object would re-render every rack on any player's draft tick.
  const draftForSlot = useGameStore((s) => s.othersDraft[slot]);

  const isMine = identity?.slot === slot;
  const myTurn = turnIndex === slot;
  const canDrag = isMine && myTurn;

  // Hide tiles currently staged on the board — my own pending placements on my
  // rack, or another player's live draft on theirs — so each rack shows what's
  // actually left in that player's hand.
  const stagedIds = new Set((isMine ? pending : draftForSlot).map((p) => p.tileId));
  const visible = tiles.filter((t) => !stagedIds.has(t.id));
  const slots: (TileT | null)[] = Array.from({ length: RACK_SIZE }, (_, i) => visible[i] ?? null);

  return (
    <div className="flex gap-1 rounded-md p-1" style={{ background: 'rgba(60,50,30,0.07)' }}>
      {slots.map((t, i) => (
        <div
          key={i}
          className="flex items-center justify-center rounded"
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
