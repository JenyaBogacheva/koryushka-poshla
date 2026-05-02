import type { GameState, Slot } from '@shared/types';
import { sendDrawTile } from '../ws.js';

type Props = { state: GameState; mySlot: Slot };

export function DrawForOrderScreen({ state, mySlot }: Props) {
  const ds = state.drawState;
  if (ds === null) return null;

  const heading = ds.round === 1 ? 'Жребий' : `Перетягивание — раунд ${ds.round}`;
  const subtitle =
    ds.round === 1
      ? 'Каждый игрок тянет по букве. Кто ближе к началу алфавита — ходит первым.'
      : 'Между игроками с одинаковой буквой — ещё один раунд.';

  const slots: Slot[] = [0, 1, 2];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[32rem] max-w-[90vw] rounded-xl bg-white p-6 text-center shadow-2xl">
        <div className="mb-1 text-2xl font-bold">{heading}</div>
        <div className="mb-5 text-sm text-ink/70">{subtitle}</div>
        <div className="flex justify-center gap-6">
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

function DrawSlotCard({ name, isCandidate, draw, isMe }: CardProps) {
  return (
    <div className="flex w-28 flex-col items-center gap-2">
      <div className="text-sm font-semibold">{name}</div>
      {!isCandidate ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-ink/5 text-2xl text-ink/30">
          —
        </div>
      ) : draw !== null ? (
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-tile text-2xl font-semibold shadow-sm">
          {draw.letter ?? '★'}
        </div>
      ) : isMe ? (
        <button
          type="button"
          className="h-14 w-28 rounded-md bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
          onClick={() => sendDrawTile()}
        >
          Тяни!
        </button>
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-md border border-ink/20 bg-ink/5 text-xs text-ink/50">
          Ждём…
        </div>
      )}
    </div>
  );
}
