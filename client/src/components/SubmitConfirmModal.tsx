import type { Slot } from '@shared/types';
import { fishForSlot } from '../fish.js';

type Props = {
  open: boolean;
  tileCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  /** Active player's slot — drives accent color + header fish. */
  fishSlot?: Slot;
};

export function SubmitConfirmModal({ open, tileCount, onCancel, onConfirm, fishSlot }: Props) {
  if (!open) return null;
  const ownFish = fishSlot !== undefined ? fishForSlot(fishSlot) : null;
  const accent = ownFish?.accent ?? 'var(--color-accent)';
  const titleColor = ownFish?.deep ?? 'var(--color-ink)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="relative w-[340px] overflow-hidden rounded-2xl p-6"
        style={{
          background: 'var(--color-panel)',
          boxShadow: '0 20px 60px rgba(40,30,15,0.35), 0 0 0 1px rgba(60,50,35,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {ownFish && (
          <img
            src={ownFish.src}
            alt=""
            aria-hidden
            className="pointer-events-none absolute"
            style={{ right: -34, top: -10, width: 150, opacity: 0.18 }}
          />
        )}

        <div className="relative flex items-center gap-3">
          {ownFish && (
            <img src={ownFish.src} alt="" aria-hidden style={{ width: 40, height: 'auto' }} />
          )}
          <h2 className="font-heading font-bold leading-none" style={{ fontSize: 26, color: titleColor }}>
            Походить?
          </h2>
        </div>
        <p className="relative mt-1 text-sm text-ink-soft">
          {tileCount} {pluralRu(tileCount, 'плитка', 'плитки', 'плиток')}
        </p>

        <div className="relative mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="font-heading rounded-full px-5 py-2 text-base font-semibold text-white shadow"
            style={{ background: accent }}
          >
            Походить
          </button>
        </div>
      </div>
    </div>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
