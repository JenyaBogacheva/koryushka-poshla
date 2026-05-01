import { useEffect } from 'react';
import type { Letter } from '@shared/types';

type Props = {
  title: string;
  letters: Letter[];
  onPick: (letter: Letter) => void;
  onCancel: () => void;
};

export function LetterPicker({ title, letters, onPick, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="rounded-lg bg-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm font-medium text-ink">{title}</div>
        <div className="grid grid-cols-6 gap-2">
          {letters.map((L) => (
            <button
              key={L}
              className="h-10 w-10 rounded bg-tile text-lg font-semibold text-ink hover:bg-tile/80"
              onClick={() => onPick(L)}
            >
              {L}
            </button>
          ))}
        </div>
        <div className="mt-3 text-right">
          <button
            className="rounded px-3 py-1 text-sm text-ink/70 hover:bg-ink/10"
            onClick={onCancel}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
