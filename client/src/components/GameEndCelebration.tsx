import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { GameState, Slot } from '@shared/types';
import { endGameBadges } from '@shared/badges.js';
import { fishForSlot } from '../fish.js';

type Props = {
  state: GameState;
  onDismiss: () => void;
};

export function GameEndCelebration({ state, onDismiss }: Props) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0]!;
  const winnerFish = fishForSlot(winner.slot);

  const scores: Record<Slot, number> = {
    0: state.players[0].score,
    1: state.players[1].score,
    2: state.players[2].score,
  };
  const badgesBySlot = endGameBadges(state.events, scores);

  const scoreMV = useMotionValue(0);
  const scoreText = useTransform(scoreMV, (v) => Math.round(v).toString());

  useEffect(() => {
    const controls = animate(scoreMV, winner.score, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => {
      controls.stop();
    };
  }, [winner.score, scoreMV]);

  useEffect(() => {
    fireConfetti(winnerFish.accent);
    const t1 = window.setTimeout(() => fireConfetti(winnerFish.accent), 600);
    const t2 = window.setTimeout(() => fireConfetti(winnerFish.accent), 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [winnerFish.accent]);

  return (
    <motion.div
      role="dialog"
      aria-label="Игра окончена"
      onClick={onDismiss}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background:
          'radial-gradient(ellipse at top, rgba(45,36,25,0.55) 0%, rgba(45,36,25,0.85) 80%)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.05 }}
        className="relative flex w-[36rem] max-w-[92vw] cursor-pointer flex-col items-center overflow-hidden rounded-3xl px-10 pb-8 pt-12"
        style={{
          background: `linear-gradient(160deg, ${winnerFish.soft} 0%, var(--color-panel) 70%)`,
          boxShadow: `0 30px 80px rgba(40,30,15,0.45), 0 0 0 1px rgba(60,50,35,0.10), 0 0 0 6px ${winnerFish.accent}22`,
        }}
      >
        {/* Drifting watermark fish */}
        <motion.img
          src={winnerFish.src}
          alt=""
          aria-hidden
          initial={{ x: -60, y: -20, opacity: 0 }}
          animate={{ x: 0, y: -10, opacity: 0.2 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="pointer-events-none absolute"
          style={{ right: -130, top: -30, width: 300 }}
        />
        <motion.img
          src={winnerFish.src}
          alt=""
          aria-hidden
          initial={{ x: 120, opacity: 0, scaleX: -1 }}
          animate={{ x: 24, opacity: 0.10, scaleX: -1 }}
          transition={{ duration: 1.4, ease: 'easeOut', delay: 0.2 }}
          className="pointer-events-none absolute"
          style={{ left: -34, bottom: -10, width: 200 }}
        />

        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="relative text-[11px] uppercase tracking-[0.3em] text-ink-soft"
        >
          корюшка пришла
        </motion.p>

        {/* Big winner fish, walking */}
        <motion.div
          initial={{ scale: 0.4, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.2 }}
          className="relative mt-3"
        >
          <img
            src={winnerFish.src}
            alt=""
            className="fish-walk-big"
            style={{ width: 200, height: 'auto' }}
          />
        </motion.div>

        {/* Name + score */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="font-heading relative mt-2 text-center font-bold leading-[0.9] tracking-tight"
          style={{ fontSize: 72, color: winnerFish.deep }}
        >
          {winner.name}
        </motion.div>
        <motion.span
          className="font-heading relative mt-2 block tabular-nums"
          style={{ fontSize: 56, color: winnerFish.accent, lineHeight: 1 }}
        >
          {scoreText}
        </motion.span>

        {/* Standings */}
        <ol className="relative mt-8 w-full space-y-2">
          {sorted.map((p, i) => {
            const fish = fishForSlot(p.slot);
            const isHelper = badgesBySlot[p.slot].includes('helper');
            const isWinner = i === 0;
            return (
              <motion.li
                key={p.slot}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.7 + i * 0.16 }}
                className="flex items-center justify-between rounded-2xl px-4 py-2.5"
                style={{
                  background: isWinner ? `${fish.soft}88` : 'rgba(255,255,255,0.5)',
                  boxShadow: isWinner ? `inset 0 0 0 2px ${fish.accent}` : 'none',
                }}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="font-heading w-6 text-center font-bold"
                    style={{ color: 'var(--color-ink-soft)', fontSize: 22 }}
                  >
                    {i + 1}
                  </span>
                  <img src={fish.src} alt="" aria-hidden style={{ width: 36, height: 'auto' }} />
                  <span
                    className="font-heading font-bold leading-none"
                    style={{ fontSize: 22, color: fish.deep }}
                  >
                    {p.name}
                  </span>
                  {isHelper && (
                    <motion.span
                      initial={{ scale: 0, rotate: -10 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 1.0 + i * 0.16 }}
                      title="Помощник — больше всего подсказок"
                      className="font-heading rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider"
                      style={{
                        background: 'var(--color-cell)',
                        color: '#3a6b5e',
                        boxShadow: 'inset 0 0 0 1.5px rgba(58,107,94,0.55)',
                      }}
                    >
                      помощник
                    </motion.span>
                  )}
                </span>
                <span
                  className="font-heading font-bold tabular-nums"
                  style={{ fontSize: 28, color: fish.deep }}
                >
                  {p.score}
                </span>
              </motion.li>
            );
          })}
        </ol>

        <p className="font-heading relative mt-7 text-sm italic text-ink-soft">
          нажми, чтобы продолжить
        </p>
      </motion.div>
    </motion.div>
  );
}

function fireConfetti(accent: string) {
  // Mix the winner's accent with two koryushka palette colors
  const colors = [accent, '#fbe9b0', '#bfe1e2', '#e6c8b8', '#fdfdfb'];
  const defaults = { startVelocity: 36, spread: 360, ticks: 90, zIndex: 60, scalar: 1.05, colors };
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.18, y: 0.4 } });
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.82, y: 0.4 } });
  confetti({ ...defaults, particleCount: 90, origin: { x: 0.5, y: 0.3 }, spread: 130 });
}
