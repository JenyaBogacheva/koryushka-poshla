import type { Player } from '@shared/types';
import { Rack } from './Rack.js';

type Props = {
  player: Player;
  isCurrentTurn: boolean;
};

export function PlayerCard({ player, isCurrentTurn }: Props) {
  const bg = isCurrentTurn ? 'bg-peach' : 'bg-tile';
  return (
    <div className={`rounded-md ${bg} p-3 shadow-sm`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold">{player.name || `Slot ${player.slot}`}</span>
        <span className="text-xl font-bold tabular-nums">{player.score}</span>
      </div>
      <Rack tiles={player.rack} />
    </div>
  );
}
