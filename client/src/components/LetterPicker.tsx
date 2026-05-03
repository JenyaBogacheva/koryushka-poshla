import { useEffect } from 'react';
import type { Letter, Slot } from '@shared/types';
import { fishForSlot } from '../fish.js';

type Props = {
  title: string;
  letters: Letter[];
  onPick: (letter: Letter) => void;
  onCancel: () => void;
  fishSlot?: Slot;
};

export function LetterPicker({ title, letters, onPick, onCancel, fishSlot }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const fish = fishSlot !== undefined ? fishForSlot(fishSlot) : null;
  const accent = fish?.accent ?? 'var(--color-accent)';
  const titleColor = fish?.deep ?? 'var(--color-ink)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="relative max-w-[420px] overflow-hidden rounded-2xl p-6"
        style={{
          background: 'var(--color-panel)',
          boxShadow: '0 20px 60px rgba(40,30,15,0.35), 0 0 0 1px rgba(60,50,35,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {fish && (
          <img
            src={fish.src}
            alt=""
            aria-hidden
            className="pointer-events-none absolute"
            style={{ right: -34, top: -10, width: 150, opacity: 0.18 }}
          />
        )}

        <div className="relative mb-4 flex items-center gap-3">
          {fish && (
            <img src={fish.src} alt="" aria-hidden style={{ width: 40, height: 'auto' }} />
          )}
          <h2 className="font-heading font-bold leading-none" style={{ fontSize: 26, color: titleColor }}>
            {title}
          </h2>
        </div>

        <div className="relative grid grid-cols-8 gap-1.5">
          {letters.map((L) => (
            <button
              key={L}
              type="button"
              onClick={() => onPick(L)}
              className="font-heading flex h-10 w-10 items-center justify-center rounded-md bg-tile text-xl font-bold text-ink hover:-translate-y-0.5 transition-transform"
              style={{
                color: '#1f2a30',
                boxShadow:
                  '0 1px 0 rgba(40,60,75,0.06), 0 2px 5px rgba(40,60,75,0.10), inset 0 0 0 1px rgba(255,255,255,0.7)',
              }}
            >
              {L}
            </button>
          ))}
        </div>

        <div className="relative mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm hover:brightness-95"
            style={{ background: 'rgba(45,36,25,0.08)', color: accent }}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
