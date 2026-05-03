import { motion } from 'framer-motion';
import type { DrawForOrderRecord, Slot } from '@shared/types';
import { fishForSlot } from '../fish.js';

type Props = {
  ev: DrawForOrderRecord;
  nameOf: (slot: Slot) => string;
  onDismiss: () => void;
};

export function DrawResultReveal({ ev, nameOf, onDismiss }: Props) {
  // Turn order: firstSlot, (firstSlot+1)%3, (firstSlot+2)%3
  const ordered = [0, 1, 2].map((i) => {
    const slot = ((ev.firstSlot + i) % 3) as Slot;
    const draw = ev.draws.find((d) => d.slot === slot) ?? null;
    return { slot, letter: draw?.letter ?? '★', position: i + 1 };
  });

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative w-[34rem] max-w-[90vw] overflow-hidden rounded-2xl p-7 text-center"
        initial={{ scale: 0.85, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 26 }}
        style={{
          background: 'var(--color-panel)',
          boxShadow: '0 20px 60px rgba(40,30,15,0.35), 0 0 0 1px rgba(60,50,35,0.08)',
        }}
      >
        <h2 className="font-heading font-bold leading-none" style={{ fontSize: 36 }}>
          Жребий брошен
        </h2>
        <p className="mt-2 text-sm italic text-ink-soft">первым ходит {nameOf(ev.firstSlot)}</p>

        <div className="mt-6 flex items-end justify-center gap-3">
          {ordered.map((p, i) => {
            const fish = fishForSlot(p.slot);
            return (
              <div key={p.slot} className="flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: i * 0.18 + 0.1, type: 'spring', stiffness: 320, damping: 20 }}
                  className="flex w-24 flex-col items-center gap-2"
                >
                  <div className="relative">
                    <span
                      className="font-heading absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{
                        background: fish.accent,
                        boxShadow: '0 2px 4px rgba(60,50,35,0.2), 0 0 0 2px var(--color-panel)',
                      }}
                    >
                      {p.position}
                    </span>
                    <div
                      className="font-heading flex h-16 w-16 items-center justify-center rounded-md bg-tile font-bold"
                      style={{
                        fontSize: 32,
                        color: '#1f2a30',
                        boxShadow:
                          '0 1px 0 rgba(40,60,75,0.06), 0 2px 6px rgba(40,60,75,0.12), inset 0 0 0 1px rgba(255,255,255,0.7)',
                      }}
                    >
                      {p.letter}
                    </div>
                  </div>
                  <img src={fish.src} alt="" aria-hidden style={{ width: 44, height: 'auto' }} />
                  <div
                    className="font-heading font-bold leading-none"
                    style={{ fontSize: 18, color: fish.deep }}
                  >
                    {nameOf(p.slot)}
                  </div>
                </motion.div>
                {i < ordered.length - 1 && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.18 + 0.32 }}
                    className="font-heading mb-9 text-2xl text-ink-soft"
                  >
                    →
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: ordered.length * 0.18 + 0.3 }}
          className="mt-7 flex justify-center"
        >
          <button
            type="button"
            onClick={onDismiss}
            className="font-heading rounded-full px-7 py-3 text-xl font-semibold tracking-wide text-white shadow-[0_2px_0_rgba(60,50,35,0.06),0_6px_18px_rgba(60,50,35,0.10)]"
            style={{ background: fishForSlot(ev.firstSlot).accent }}
          >
            К игре
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
