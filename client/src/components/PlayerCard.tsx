import { useState, useRef, useEffect } from 'react';
import type { BadgeKind, Player, Slot } from '@shared/types';
import { Rack } from './Rack.js';
import { BadgeStrip } from './BadgeStrip.js';
import { FishBadge } from './FishBadge.js';
import { ConfirmModal } from './ConfirmModal.js';
import { useGameStore } from '../store.js';
import { sendSubmitMove, sendPass, sendSwapAll, sendRedraw, sendGiveAssist, sendRevertAssist } from '../ws.js';
import { perMoveBadges, endGameBadges } from '@shared/badges.js';
import { fishForSlot } from '../fish.js';

type Props = {
  player: Player;
  isCurrentTurn: boolean;
};

export function PlayerCard({ player, isCurrentTurn }: Props) {
  const identity = useGameStore((s) => s.identity);
  const pending = useGameStore((s) => s.pendingPlacements);
  const movePreview = useGameStore((s) => s.movePreview);
  const clearPending = useGameStore((s) => s.clearPending);
  const allPlayers = useGameStore((s) => s.state?.players ?? []);
  const allEvents = useGameStore((s) => s.state?.events ?? []);
  const phase = useGameStore((s) => s.state?.phase ?? 'waiting');
  const bagLeft = useGameStore((s) => s.state?.bag.length ?? 0);
  const [passOpen, setPassOpen] = useState(false);
  const [swapAllOpen, setSwapAllOpen] = useState(false);

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
  const assistCount = allEvents.filter(
    (e) => e.kind === 'assist' && e.helperSlot === player.slot,
  ).length;
  const fish = fishForSlot(player.slot);
  const cardStyle: React.CSSProperties = isCurrentTurn
    ? {
        background: `linear-gradient(135deg, ${fish.soft} 0%, var(--color-panel) 80%)`,
        boxShadow: `0 6px 18px ${fish.accent}33, 0 0 0 2.5px ${fish.accent} inset`,
      }
    : {
        background: 'var(--color-panel)',
        boxShadow: '0 2px 0 rgba(60,50,35,0.06), 0 6px 18px rgba(60,50,35,0.08)',
      };

  const prevScoreRef = useRef(player.score);
  const [pop, setPop] = useState<{ key: number; delta: number } | null>(null);
  useEffect(() => {
    if (player.score > prevScoreRef.current) {
      setPop({ key: Date.now(), delta: player.score - prevScoreRef.current });
    }
    prevScoreRef.current = player.score;
  }, [player.score]);

  function onConfirm() {
    const placements = pending.map((p) => ({
      tileId: p.tileId,
      row: p.row,
      col: p.col,
      playedAs: p.playedAs,
    }));
    sendSubmitMove(placements);
  }

  return (
    <div
      className={`relative shrink-0 rounded-2xl px-4 py-3 transition-all ${player.connected ? '' : 'opacity-70'}`}
      style={cardStyle}
    >
      {/* Watermark fish (clipped behind everything) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <img
          src={fish.src}
          alt=""
          aria-hidden
          className="absolute"
          style={{
            right: -34,
            top: -6,
            width: 150,
            opacity: isCurrentTurn ? 0.22 : 0.08,
          }}
        />
      </div>

      {pop !== null && (
        <span key={pop.key} className="score-pop right-3 top-3" style={{ color: fish.deep }}>+{pop.delta}</span>
      )}

      <div className="relative mb-3 flex items-center gap-5">
        <FishBadge fish={fish} size={56} animated={isCurrentTurn} />
        <div className="flex min-w-0 flex-1 items-baseline justify-between">
          <div className="flex items-center gap-2">
            <span
              className="font-heading font-bold leading-none"
              style={{ fontSize: 30, color: fish.deep }}
            >
              {player.name || `Слот ${player.slot}`}
            </span>
            {isMine && (
              <span
                className="inline-flex items-center justify-center rounded px-1.5 leading-none text-sm font-bold uppercase tracking-wider text-white"
                style={{ background: fish.accent, height: 16 }}
              >
                ты
              </span>
            )}
            {!player.connected && (
              <span className="inline-flex items-center gap-1 text-sm text-ink/50">
                <span className="h-2 w-2 rounded-full bg-ink/40" />не в сети
              </span>
            )}
          </div>
          <span
            className="font-heading font-bold leading-none tabular-nums"
            style={{ fontSize: 36, color: fish.deep }}
          >
            {player.score}
          </span>
        </div>
      </div>
      <div className="relative">
        <BadgeStrip badges={badges} />
        <Rack slot={player.slot} tiles={player.rack} />
      </div>
      {!isMine && phase === 'playing' && (
        <div className="relative mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => sendGiveAssist(player.slot)}
            className="font-heading inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-base font-semibold text-white shadow"
            style={{ background: fish.accent }}
          >
            <img src={fish.src} alt="" aria-hidden style={{ width: 18, height: 'auto' }} />
            помог +5
          </button>
          <button
            type="button"
            onClick={() => sendRevertAssist(player.slot)}
            disabled={assistCount === 0}
            className="rounded-full bg-ink/10 px-3 py-2 text-sm hover:bg-ink/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            −5
          </button>
          {assistCount > 0 && (
            <span className="text-sm text-ink-soft tabular-nums">+{assistCount * 5} за помощь</span>
          )}
        </div>
      )}
      {showButtons && (
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={movePreview !== null && !movePreview.ok}
            onClick={onConfirm}
            className="font-heading rounded-full px-4 py-2 text-lg font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: fish.accent }}
          >
            Походить
            {movePreview?.ok === true && (
              <span className="ml-2 tabular-nums">+{movePreview.totalScore}</span>
            )}
          </button>
          {movePreview?.ok === true && movePreview.bingoBonus && (
            <span className="rounded bg-prem-tl/40 px-1.5 py-0.5 text-sm">+10 бинго</span>
          )}
          {movePreview?.ok === false && (
            <span
              className="font-heading basis-full text-base font-semibold leading-tight"
              style={{ color: fish.deep }}
              title={movePreview.reason}
            >
              {movePreview.reason}
            </span>
          )}
          <button
            type="button"
            onClick={clearPending}
            className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
          >
            Вернуть
          </button>
        </div>
      )}
      {isMine && isCurrentTurn && pending.length === 0 && (
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPassOpen(true)}
            className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
          >
            Пропустить
          </button>
          {bagLeft > 0 && (
            <button
              type="button"
              onClick={() => setSwapAllOpen(true)}
              className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
            >
              Поменять буквы{player.redrawEligible ? ' · бесплатно' : ''}
            </button>
          )}
        </div>
      )}
      <ConfirmModal
        open={passOpen}
        title="Пропустить ход?"
        message="Твой ход перейдёт следующему игроку."
        confirmLabel="Пропустить"
        fishSlot={player.slot}
        onConfirm={() => { sendPass(); setPassOpen(false); }}
        onCancel={() => setPassOpen(false)}
      />
      <ConfirmModal
        open={swapAllOpen}
        title="Поменять буквы?"
        message={
          player.redrawEligible
            ? 'Все буквы вернутся в мешок, ты возьмёшь новые и продолжишь ход — бесплатно.'
            : 'Все 7 букв вернутся в мешок, ты возьмёшь новые и пропустишь ход.'
        }
        confirmLabel="Поменять"
        fishSlot={player.slot}
        onConfirm={() => {
          if (player.redrawEligible) sendRedraw();
          else sendSwapAll();
          setSwapAllOpen(false);
        }}
        onCancel={() => setSwapAllOpen(false)}
      />
    </div>
  );
}
