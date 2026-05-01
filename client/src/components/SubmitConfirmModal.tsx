import type { Slot } from '@shared/types';
import { useGameStore } from '../store.js';

type Props = {
  open: boolean;
  otherPlayers: { slot: Slot; name: string }[];
  tileCount: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SubmitConfirmModal({ open, otherPlayers, tileCount, onCancel, onConfirm }: Props) {
  const helper = useGameStore((s) => s.pendingHelperSlot);
  const setHelper = useGameStore((s) => s.setPendingHelperSlot);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="w-80 rounded-lg bg-tile p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-base font-semibold text-ink">
          Сходить? ({tileCount} {pluralRu(tileCount, 'плитка', 'плитки', 'плиток')})
        </p>
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm text-ink/70">Кто помог?</legend>
          <label className="mb-1 flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="helper"
              checked={helper === null}
              onChange={() => setHelper(null)}
            />
            никто
          </label>
          {otherPlayers.map((p) => (
            <label key={p.slot} className="mb-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="helper"
                checked={helper === p.slot}
                onChange={() => setHelper(p.slot)}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded bg-ink/10 px-3 py-1.5 text-sm hover:bg-ink/20"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-sage px-3 py-1.5 text-sm font-semibold text-ink shadow hover:bg-sage-light"
          >
            Сходить
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
