import type { Player } from '@shared/types';
import { Rack } from './Rack.js';
import { useGameStore } from '../store.js';
import { send } from '../ws.js';

type Props = {
  player: Player;
  isCurrentTurn: boolean;
};

export function PlayerCard({ player, isCurrentTurn }: Props) {
  const identity = useGameStore((s) => s.identity);
  const pending = useGameStore((s) => s.pendingPlacements);
  const clearPending = useGameStore((s) => s.clearPending);

  const isMine = identity?.slot === player.slot;
  const showButtons = isMine && isCurrentTurn && pending.length > 0;
  const bg = isCurrentTurn ? 'bg-peach' : 'bg-tile';

  function onSubmit() {
    const placements = pending.map((p) => ({
      tileId: p.tileId,
      row: p.row,
      col: p.col,
      playedAs: p.playedAs,
    }));
    send({ type: 'submitMove', placements });
  }

  return (
    <div className={`rounded-md ${bg} p-3 shadow-sm`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold">
          {player.name || `Slot ${player.slot}`}
          {isMine && <span className="ml-2 rounded bg-sage px-1.5 py-0.5 text-xs font-medium text-ink">ты</span>}
        </span>
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
