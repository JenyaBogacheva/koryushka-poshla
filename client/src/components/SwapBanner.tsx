import { useState } from 'react';
import type { GameState, Slot } from '@shared/types';
import { sendRespondSwap, sendCancelSwap } from '../ws.js';
import { fishForSlot } from '../fish.js';
import { isFemName } from '../gender.js';

type Props = { state: GameState; mySlot: Slot };

export function SwapBanner({ state, mySlot }: Props) {
  const offer = state.pendingSwap;
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  if (offer === null) return null;

  const nameOf = (slot: Slot): string => state.players[slot]?.name || `Слот ${slot}`;
  const fromFish = fishForSlot(offer.fromSlot);
  const isTarget = mySlot === offer.toSlot;
  const isInitiator = mySlot === offer.fromSlot;
  const isParticipant = isTarget || isInitiator;

  // Bystanders have nothing to act on, so let them close the overlay locally.
  // Keyed by createdAt so the next offer re-opens it.
  if (!isParticipant && dismissedAt === offer.createdAt) return null;

  const card = (
    <div
      className="relative w-full max-w-lg rounded-2xl px-4 py-3"
      style={{ background: fromFish.soft, boxShadow: `0 0 0 2px ${fromFish.accent} inset` }}
      data-testid="swap-banner"
    >
      {!isParticipant && (
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => setDismissedAt(offer.createdAt)}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink/10 text-ink hover:bg-ink/20"
        >
          ✕
        </button>
      )}
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
                Согласн{isFemName(nameOf(offer.toSlot)) ? 'а' : 'ен'} (+5)
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

  // Dim the whole screen (fixed backdrop), but center the card over the board
  // column (absolute, anchored to its relative parent in App) rather than the
  // viewport — so the card sits on the playing field while everything dims.
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" />
      <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
        {card}
      </div>
    </>
  );
}
