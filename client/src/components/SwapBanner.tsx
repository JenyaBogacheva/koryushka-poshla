import type { GameState, Slot } from '@shared/types';
import { sendRespondSwap, sendCancelSwap } from '../ws.js';
import { fishForSlot } from '../fish.js';

type Props = { state: GameState; mySlot: Slot };

export function SwapBanner({ state, mySlot }: Props) {
  const offer = state.pendingSwap;
  if (offer === null) return null;

  const nameOf = (slot: Slot): string => state.players[slot]?.name || `Слот ${slot}`;
  const fromFish = fishForSlot(offer.fromSlot);
  const isTarget = mySlot === offer.toSlot;
  const isInitiator = mySlot === offer.fromSlot;

  return (
    <div
      className="w-full rounded-2xl px-4 py-3"
      style={{ background: fromFish.soft, boxShadow: `0 0 0 2px ${fromFish.accent} inset` }}
      data-testid="swap-banner"
    >
      <div className="font-heading text-lg font-bold" style={{ color: fromFish.deep }}>
        {offer.phrase}
      </div>
      <div className="mt-1 text-base text-ink">
        <strong style={{ color: fromFish.deep }}>{nameOf(offer.fromSlot)}</strong>{' '}
        хочет обменять букву с <strong>{nameOf(offer.toSlot)}</strong> ради слова{' '}
        <span className="font-heading font-semibold">«{offer.word}»</span>.
      </div>
      {(isTarget || isInitiator) && (
        <div className="mt-2 flex gap-2">
          {isTarget && (
            <>
              <button
                type="button"
                onClick={() => sendRespondSwap(true)}
                className="font-heading rounded-full px-4 py-2 text-base font-semibold text-white shadow"
                style={{ background: fromFish.accent }}
              >
                Согласна (+5)
              </button>
              <button
                type="button"
                onClick={() => sendRespondSwap(false)}
                className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
              >
                Отказаться
              </button>
            </>
          )}
          {isInitiator && (
            <button
              type="button"
              onClick={() => sendCancelSwap()}
              className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20"
            >
              Отменить
            </button>
          )}
        </div>
      )}
    </div>
  );
}
