import type { Player } from '@shared/types';
import { Rack } from './Rack.js';
import { useGameStore } from '../store.js';
import { send } from '../ws.js';

type Props = {
  player: Player;
  isCurrentTurn: boolean;
};

export function PlayerCard({ player, isCurrentTurn }: Props) {
  const mySlot = useGameStore((s) => s.mySlot);
  const state = useGameStore((s) => s.state);
  const pending = useGameStore((s) => s.pendingPlacements);
  const clearPending = useGameStore((s) => s.clearPending);

  const isMine = mySlot === player.slot;
  const showButtons = isMine && isCurrentTurn && pending.length > 0;
  const bg = isCurrentTurn ? 'bg-peach' : 'bg-tile';

  function onSubmit() {
    if (state === null || mySlot === null) return;
    const myRack = state.players[mySlot]!.rack;
    const placements = pending
      .map((p) => {
        const tile = myRack.find((t) => t.id === p.tileId);
        if (!tile) return null;
        return { tileId: p.tileId, row: p.row, col: p.col, playedAs: tile.letter };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    send({ type: 'submitMove', placements });
  }

  return (
    <div className={`rounded-md ${bg} p-3 shadow-sm`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold">{player.name || `Slot ${player.slot}`}</span>
        <span className="text-xl font-bold tabular-nums">{player.score}</span>
      </div>
      <Rack slot={player.slot} tiles={player.rack} />
      {showButtons && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onSubmit}
            className="rounded bg-sage px-3 py-1.5 text-sm font-semibold text-ink shadow hover:bg-sage-light"
          >
            Сходить
          </button>
          <button
            type="button"
            onClick={clearPending}
            className="rounded bg-ink/10 px-3 py-1.5 text-sm hover:bg-ink/20"
          >
            Вернуть
          </button>
        </div>
      )}
    </div>
  );
}
