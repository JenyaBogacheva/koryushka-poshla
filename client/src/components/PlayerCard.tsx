import { useState, useRef, useEffect } from 'react';
import type { Player } from '@shared/types';
import { Rack } from './Rack.js';
import { SubmitConfirmModal } from './SubmitConfirmModal.js';
import { useGameStore } from '../store.js';
import { sendSubmitMove } from '../ws.js';

type Props = {
  player: Player;
  isCurrentTurn: boolean;
};

export function PlayerCard({ player, isCurrentTurn }: Props) {
  const identity = useGameStore((s) => s.identity);
  const pending = useGameStore((s) => s.pendingPlacements);
  const helper = useGameStore((s) => s.pendingHelperSlot);
  const clearPending = useGameStore((s) => s.clearPending);
  const allPlayers = useGameStore((s) => s.state?.players ?? []);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isMine = identity?.slot === player.slot;
  const showButtons = isMine && isCurrentTurn && pending.length > 0;
  const bg = isCurrentTurn ? 'bg-peach' : 'bg-tile';

  const prevScoreRef = useRef(player.score);
  const [pop, setPop] = useState<{ key: number; delta: number } | null>(null);
  useEffect(() => {
    if (player.score > prevScoreRef.current) {
      setPop({ key: Date.now(), delta: player.score - prevScoreRef.current });
    }
    prevScoreRef.current = player.score;
  }, [player.score]);

  const others = allPlayers
    .filter((p) => identity !== null && p.slot !== identity.slot)
    .map((p) => ({ slot: p.slot, name: p.name || `Слот ${p.slot}` }));

  function onConfirm() {
    const placements = pending.map((p) => ({
      tileId: p.tileId,
      row: p.row,
      col: p.col,
      playedAs: p.playedAs,
    }));
    sendSubmitMove(placements, helper);
    setConfirmOpen(false);
  }

  return (
    <div className={`relative rounded-md ${bg} p-3 shadow-sm`}>
      {pop !== null && (
        <span key={pop.key} className="score-pop right-2 top-2">+{pop.delta}</span>
      )}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold">
          {player.name || `Слот ${player.slot}`}
          {isMine && <span className="ml-2 rounded bg-sage px-1.5 py-0.5 text-xs font-medium text-ink">ты</span>}
        </span>
        <span className="text-xl font-bold tabular-nums">{player.score}</span>
      </div>
      <Rack slot={player.slot} tiles={player.rack} />
      {showButtons && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
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
      {identity !== null && (
        <SubmitConfirmModal
          open={confirmOpen}
          otherPlayers={others}
          tileCount={pending.length}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={onConfirm}
        />
      )}
    </div>
  );
}
