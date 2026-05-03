import type { Slot } from '@shared/types';
import { useGameStore } from '../store.js';
import { fishForSlot } from '../fish.js';

type Props = {
  open: boolean;
  otherPlayers: { slot: Slot; name: string }[];
  tileCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  /** Active player's slot — drives accent color + header fish. */
  fishSlot?: Slot;
};

export function SubmitConfirmModal({ open, otherPlayers, tileCount, onCancel, onConfirm, fishSlot }: Props) {
  const helper = useGameStore((s) => s.pendingHelperSlot);
  const setHelper = useGameStore((s) => s.setPendingHelperSlot);

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

        <fieldset className="relative mt-4">
          <legend className="mb-2 text-[11px] uppercase tracking-wider text-ink-soft">Кто помог?</legend>
          <div className="flex flex-col gap-1">
            <HelperOption
              checked={helper === null}
              onChange={() => setHelper(null)}
              label="никто"
              accent={accent}
            />
            {otherPlayers.map((p) => {
              const f = fishForSlot(p.slot);
              return (
                <HelperOption
                  key={p.slot}
                  checked={helper === p.slot}
                  onChange={() => setHelper(p.slot)}
                  label={p.name}
                  accent={accent}
                  fishSrc={f.src}
                  fishDeep={f.deep}
                />
              );
            })}
          </div>
        </fieldset>

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

type HelperOptionProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
  accent: string;
  fishSrc?: string;
  fishDeep?: string;
};

function HelperOption({ checked, onChange, label, accent, fishSrc, fishDeep }: HelperOptionProps) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-black/5"
      style={checked ? { boxShadow: `inset 0 0 0 2px ${accent}`, background: 'rgba(255,255,255,0.4)' } : undefined}
    >
      <input
        type="radio"
        name="helper"
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
        style={{ borderColor: accent }}
      >
        {checked && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
      </span>
      {fishSrc && <img src={fishSrc} alt="" aria-hidden style={{ width: 22, height: 'auto' }} />}
      <span style={{ color: fishDeep ?? 'inherit', fontWeight: fishDeep ? 600 : 400 }}>{label}</span>
    </label>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
