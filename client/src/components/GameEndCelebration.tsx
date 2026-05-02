import { useEffect, useState } from 'react';
import type { GameState, Slot } from '@shared/types';
import { endGameBadges } from '@server/badges.js';

type Props = {
  state: GameState;
  onDismiss: () => void;
};

const CONFETTI_COUNT = 36;
const AUTO_DISMISS_MS = 6000;

export function GameEndCelebration({ state, onDismiss }: Props) {
  const [scoreShown, setScoreShown] = useState(0);
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0]!;

  const scores: Record<Slot, number> = {
    0: state.players[0].score,
    1: state.players[1].score,
    2: state.players[2].score,
  };
  const badgesBySlot = endGameBadges(state.events, scores);

  useEffect(() => {
    const start = performance.now();
    const duration = 800;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setScoreShown(Math.round(winner.score * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const dismissTimer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(dismissTimer);
    };
  }, [winner.score, onDismiss]);

  return (
    <div
      role="dialog"
      aria-label="Игра окончена"
      onClick={onDismiss}
      className="celebration-backdrop fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 text-white"
    >
      <div className="relative flex flex-col items-center">
        <div className="celebration-name text-5xl font-bold tracking-tight">{winner.name}</div>
        <div className="mt-2 text-3xl tabular-nums">{scoreShown}</div>

        <ol className="mt-8 w-72 space-y-2">
          {sorted.map((p, i) => {
            const placeBadge = badgesBySlot[p.slot].find((b) => b === 'gold' || b === 'silver' || b === 'bronze');
            const helper = badgesBySlot[p.slot].includes('helper');
            const emoji = placeBadge === 'gold' ? '🥇' : placeBadge === 'silver' ? '🥈' : placeBadge === 'bronze' ? '🥉' : '';
            return (
              <li
                key={p.slot}
                className="badge-pop flex items-center justify-between rounded bg-white/10 px-3 py-2"
                style={{ animationDelay: `${500 + i * 250}ms` }}
              >
                <span className="flex items-center gap-2">
                  <span className="text-2xl">{emoji}</span>
                  <span>{p.name}</span>
                  {helper && <span title="Помощник — больше всего подсказок">🤝</span>}
                </span>
                <span className="font-mono tabular-nums">{p.score}</span>
              </li>
            );
          })}
        </ol>

        {Array.from({ length: CONFETTI_COUNT }).map((_, i) => {
          const cx = `${(Math.random() * 60 - 30).toFixed(1)}vw`;
          const dx = `${(Math.random() * 40 - 20).toFixed(1)}vw`;
          const delay = `${Math.floor(Math.random() * 400)}ms`;
          const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7'];
          const color = colors[i % colors.length];
          const style = { ['--cx' as string]: cx, ['--dx' as string]: dx, animationDelay: delay, background: color } as React.CSSProperties;
          return <span key={i} className="confetti-piece" style={style} />;
        })}
      </div>
      <p className="mt-10 text-sm text-white/70">нажмите, чтобы продолжить</p>
    </div>
  );
}
