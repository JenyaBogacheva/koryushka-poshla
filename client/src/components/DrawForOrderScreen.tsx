import type { GameState, GameSettings, Slot } from '@shared/types';
import { sendDrawTile, sendUpdateSettings } from '../ws.js';
import { fishForSlot } from '../fish.js';

const SETTING_MIN = 2;
const SETTING_MAX = 15;

type Props = { state: GameState; mySlot: Slot };

export function DrawForOrderScreen({ state, mySlot }: Props) {
  const ds = state.drawState;
  if (ds === null) return null;

  const heading = ds.round === 1 ? 'Жребий' : `Перетягивание — раунд ${ds.round}`;
  const subtitle =
    ds.round === 1
      ? 'Каждый тянет по букве. Кто ближе к началу алфавита — ходит первым.'
      : 'Между игроками с одинаковой буквой — ещё один раунд.';

  const slots: Slot[] = [0, 1, 2];
  const myFish = fishForSlot(mySlot);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="relative w-[34rem] max-w-[90vw] overflow-hidden rounded-2xl p-7 text-center"
        style={{
          background: 'var(--color-panel)',
          boxShadow: '0 20px 60px rgba(40,30,15,0.35), 0 0 0 1px rgba(60,50,35,0.08)',
        }}
      >
        <img
          src={myFish.src}
          alt=""
          aria-hidden
          className="pointer-events-none absolute"
          style={{ right: -40, top: -12, width: 170, opacity: 0.16 }}
        />
        <h2 className="font-heading relative font-bold leading-none" style={{ fontSize: 38 }}>
          {heading}
        </h2>
        <p className="relative mt-2 text-sm italic text-ink-soft">{subtitle}</p>
        <div className="relative mt-6 flex justify-center gap-6">
          {slots.map((slot) => (
            <DrawSlotCard
              key={slot}
              slot={slot}
              name={state.players[slot]?.name ?? `Слот ${slot}`}
              isCandidate={ds.candidates.includes(slot)}
              draw={ds.draws.find((d) => d.slot === slot) ?? null}
              isMe={slot === mySlot}
            />
          ))}
        </div>

        <SettingsSection settings={state.settings} accent={myFish.accent} />
      </div>
    </div>
  );
}

function SettingsSection({ settings, accent }: { settings: GameSettings; accent: string }) {
  const update = (patch: Partial<GameSettings>): void => {
    sendUpdateSettings({ ...settings, ...patch });
  };
  return (
    <div
      className="relative mt-6 rounded-xl px-4 py-3 text-left"
      style={{ background: 'rgba(45,36,25,0.05)' }}
    >
      <div className="mb-2 text-center text-sm font-semibold uppercase tracking-wider text-ink-soft">
        Правила игры
      </div>
      <SettingRow
        label="Мин. длина слова"
        hint="Ходы с более коротким словом не принимаются"
        value={settings.minWordLen}
        accent={accent}
        onChange={(v) => update({ minWordLen: v })}
      />
      <SettingRow
        label="Слово для обмена"
        hint="Мин. длина «крутого слова» при обмене плитками"
        value={settings.swapMinWordLen}
        accent={accent}
        onChange={(v) => update({ swapMinWordLen: v })}
      />
      <p className="mt-2 text-center text-xs italic text-ink-soft">
        Можно менять только сейчас, до начала игры.
      </p>
    </div>
  );
}

type SettingRowProps = {
  label: string;
  hint: string;
  value: number;
  accent: string;
  onChange: (value: number) => void;
};

function SettingRow({ label, hint, value, accent, onChange }: SettingRowProps) {
  const clamp = (v: number): number => Math.max(SETTING_MIN, Math.min(SETTING_MAX, v));
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="font-heading font-bold leading-tight" style={{ fontSize: 17 }}>
          {label}
        </div>
        <div className="text-xs leading-tight text-ink-soft">{hint}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StepButton label="−" disabled={value <= SETTING_MIN} accent={accent} onClick={() => onChange(clamp(value - 1))} />
        <span className="font-heading w-6 text-center font-bold" style={{ fontSize: 20 }}>
          {value}
        </span>
        <StepButton label="+" disabled={value >= SETTING_MAX} accent={accent} onClick={() => onChange(clamp(value + 1))} />
      </div>
    </div>
  );
}

function StepButton({ label, disabled, accent, onClick }: { label: string; disabled: boolean; accent: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-xl font-bold leading-none text-white transition-opacity disabled:opacity-30"
      style={{ background: accent }}
    >
      {label}
    </button>
  );
}

type CardProps = {
  slot: Slot;
  name: string;
  isCandidate: boolean;
  draw: { slot: Slot; letter: string | null } | null;
  isMe: boolean;
};

function DrawSlotCard({ slot, name, isCandidate, draw, isMe }: CardProps) {
  const fish = fishForSlot(slot);
  return (
    <div className="flex w-28 flex-col items-center gap-2">
      <img src={fish.src} alt="" aria-hidden style={{ width: 48, height: 'auto' }} />
      <div className="font-heading font-bold leading-none" style={{ fontSize: 22, color: fish.deep }}>
        {name}
      </div>
      {!isCandidate ? (
        <div
          className="font-heading flex h-14 w-14 items-center justify-center rounded-md text-2xl"
          style={{ background: 'rgba(45,36,25,0.06)', color: 'rgba(45,36,25,0.3)' }}
        >
          —
        </div>
      ) : draw !== null ? (
        <div
          className="font-heading flex h-14 w-14 items-center justify-center rounded-md bg-tile font-bold"
          style={{
            fontSize: 28,
            color: '#1f2a30',
            boxShadow:
              '0 1px 0 rgba(40,60,75,0.06), 0 2px 5px rgba(40,60,75,0.10), inset 0 0 0 1px rgba(255,255,255,0.7)',
          }}
        >
          {draw.letter ?? '★'}
        </div>
      ) : isMe ? (
        <button
          type="button"
          className="font-heading h-14 w-28 rounded-full text-lg font-semibold tracking-wide text-white shadow"
          style={{ background: fish.accent }}
          onClick={() => sendDrawTile()}
        >
          Тяни!
        </button>
      ) : (
        <div
          className="flex h-14 w-14 items-center justify-center rounded-md text-sm"
          style={{ background: 'rgba(45,36,25,0.06)', color: 'var(--color-ink-soft)' }}
        >
          Ждём…
        </div>
      )}
    </div>
  );
}
