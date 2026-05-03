import type { Slot } from '@shared/types';
import { fishForSlot } from '../fish.js';

type Props = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** When set, header is decorated with that player's fish stamp + accent color. */
  fishSlot?: Slot;
};

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  fishSlot,
}: Props) {
  if (!open) return null;
  const fish = fishSlot !== undefined ? fishForSlot(fishSlot) : null;
  const accent = fish?.accent ?? 'var(--color-accent)';
  const titleColor = fish?.deep ?? 'var(--color-ink)';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="relative min-w-[300px] max-w-md overflow-hidden rounded-2xl p-6"
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
        <div className="relative flex items-center gap-3">
          {fish && (
            <img src={fish.src} alt="" aria-hidden style={{ width: 40, height: 'auto' }} />
          )}
          <h2 className="font-heading font-bold leading-none" style={{ fontSize: 28, color: titleColor }}>
            {title}
          </h2>
        </div>
        {message !== undefined && (
          <p className="relative mt-3 text-sm text-ink-soft">{message}</p>
        )}
        <div className="relative mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="font-heading rounded-full px-5 py-2 text-base font-semibold text-white shadow"
            style={{ background: accent }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
