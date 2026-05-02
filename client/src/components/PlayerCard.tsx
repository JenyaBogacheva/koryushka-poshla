import { useState, useRef, useEffect } from 'react';
import type { BadgeKind, Player, Slot } from '@shared/types';
import { Rack } from './Rack.js';
import { SubmitConfirmModal } from './SubmitConfirmModal.js';
import { BadgeStrip } from './BadgeStrip.js';
import { useGameStore } from '../store.js';
import { sendSubmitMove } from '../ws.js';
import { perMoveBadges, endGameBadges } from '@shared/badges.js';

type Props = {
  player: Player;
  isCurrentTurn: boolean;
};

export function PlayerCard({ player, isCurrentTurn }: Props) {
  const identity = useGameStore((s) => s.identity);
  const pending = useGameStore((s) => s.pendingPlacements);
  const helper = useGameStore((s) => s.pendingHelperSlot);
  const movePreview = useGameStore((s) => s.movePreview);
  const clearPending = useGameStore((s) => s.clearPending);
  const allPlayers = useGameStore((s) => s.state?.players ?? []);
  const allEvents = useGameStore((s) => s.state?.events ?? []);
  const phase = useGameStore((s) => s.state?.phase ?? 'waiting');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const badges: BadgeKind[] = (() => {
    const live: BadgeKind[] = [];
    for (const e of allEvents) {
      if (e.kind === 'move' && e.slot === player.slot) {
        live.push(...perMoveBadges(e));
      }
    }
    if (phase !== 'finished') return live;
    const scores: Record<Slot, number> = {
      0: allPlayers[0]?.score ?? 0,
      1: allPlayers[1]?.score ?? 0,
      2: allPlayers[2]?.score ?? 0,
    };
    const end = endGameBadges(allEvents, scores)[player.slot];
    return [...end, ...live];
  })();

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
    <div className={`relative rounded-md ${bg} p-3 shadow-sm ${player.connected ? '' : 'opacity-70'}`}>
      {pop !== null && (
        <span key={pop.key} className="score-pop right-2 top-2">+{pop.delta}</span>
      )}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold">
          {player.name || `Слот ${player.slot}`}
          {isMine && <span className="ml-2 rounded bg-sage px-1.5 py-0.5 text-xs font-medium text-ink">ты</span>}
          {!player.connected && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-ink/50">
              <span className="h-2 w-2 rounded-full bg-ink/40" />не в сети
            </span>
          )}
        </span>
        <span className="text-xl font-bold tabular-nums">{player.score}</span>
      </div>
      <BadgeStrip badges={badges} />
      <Rack slot={player.slot} tiles={player.rack} />
      {showButtons && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={movePreview !== null && !movePreview.ok}
            onClick={() => setConfirmOpen(true)}
            className="rounded bg-sage px-3 py-1.5 text-sm font-semibold text-ink shadow hover:bg-sage-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            Походить
            {movePreview?.ok === true && (
              <span className="ml-2 tabular-nums">+{movePreview.totalScore}</span>
            )}
          </button>
          {movePreview?.ok === true && movePreview.bingoBonus && (
            <span className="rounded bg-sage px-1.5 py-0.5 text-xs">+10 бинго</span>
          )}
          {movePreview?.ok === false && (
            <span className="text-xs text-rose-700" title={movePreview.reason}>{movePreview.reason}</span>
          )}
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
