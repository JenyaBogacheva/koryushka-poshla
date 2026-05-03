import type { GameState, Slot } from '@shared/types';
import { sendDrawTile } from '../ws.js';
import { fishForSlot } from '../fish.js';

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
      </div>
    </div>
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
          className="flex h-14 w-14 items-center justify-center rounded-md text-xs"
          style={{ background: 'rgba(45,36,25,0.06)', color: 'var(--color-ink-soft)' }}
        >
          Ждём…
        </div>
      )}
    </div>
  );
}
