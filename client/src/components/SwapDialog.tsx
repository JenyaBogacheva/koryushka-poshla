import { useState } from 'react';
import type { Player, Slot, Tile } from '@shared/types';
import { sendOfferSwap } from '../ws.js';
import { fishForSlot } from '../fish.js';

const MIN_WORD_LEN = 7;

function cyrillicLen(word: string): number {
  return [...word].filter((ch) => /[а-яёА-ЯЁ]/.test(ch)).length;
}

type Props = {
  mySlot: Slot;
  myRack: Tile[];
  opponents: Player[]; // the other two players (visible-rack ones are selectable)
  onClose: () => void;
};

function TileChip({ tile, selected, onClick }: { tile: Tile; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-md text-lg font-semibold shadow-sm transition-transform ${
        selected ? 'scale-110 ring-2 ring-ink' : 'hover:-translate-y-0.5'
      }`}
      style={{ background: 'var(--color-tile)', color: 'var(--color-ink)' }}
    >
      {tile.isBlank ? '★' : tile.letter}
    </button>
  );
}

export function SwapDialog({ mySlot, myRack, opponents, onClose }: Props) {
  const selectable = opponents.filter((p) => p.rackVisible);
  const [targetSlot, setTargetSlot] = useState<Slot | null>(selectable[0]?.slot ?? null);
  const [giveId, setGiveId] = useState<string | null>(null);
  const [takeId, setTakeId] = useState<string | null>(null);
  const [word, setWord] = useState('');

  const target = opponents.find((p) => p.slot === targetSlot) ?? null;
  const wordOk = cyrillicLen(word) >= MIN_WORD_LEN;
  const canOffer = targetSlot !== null && giveId !== null && takeId !== null && wordOk;
  const myFish = fishForSlot(mySlot);

  function submit() {
    if (!canOffer || targetSlot === null || giveId === null || takeId === null) return;
    sendOfferSwap(targetSlot, giveId, takeId, word.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{ background: 'var(--color-panel)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-2xl font-bold" style={{ color: myFish.deep }}>Обмен буквой</h2>

        {selectable.length === 0 ? (
          <p className="mt-3 text-ink-soft">Ни у кого не видно букв — обмен невозможен.</p>
        ) : (
          <>
            <div className="mt-3">
              <div className="text-sm text-ink-soft">С кем меняемся</div>
              <div className="mt-1 flex gap-2">
                {selectable.map((p) => (
                  <button
                    key={p.slot}
                    type="button"
                    onClick={() => { setTargetSlot(p.slot); setTakeId(null); }}
                    className={`rounded-full px-3 py-1.5 text-base font-semibold ${
                      targetSlot === p.slot ? 'text-white' : 'bg-ink/10 text-ink'
                    }`}
                    style={targetSlot === p.slot ? { background: fishForSlot(p.slot).accent } : undefined}
                  >
                    {p.name || `Слот ${p.slot}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <div className="text-sm text-ink-soft">Отдаёшь</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {myRack.map((t) => (
                  <TileChip key={t.id} tile={t} selected={giveId === t.id} onClick={() => setGiveId(t.id)} />
                ))}
              </div>
            </div>

            {target !== null && (
              <div className="mt-3">
                <div className="text-sm text-ink-soft">Берёшь у {target.name || `Слот ${target.slot}`}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {target.rack.map((t) => (
                    <TileChip key={t.id} tile={t} selected={takeId === t.id} onClick={() => setTakeId(t.id)} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3">
              <div className="text-sm text-ink-soft">Ради какого слова? (от 7 букв)</div>
              <input
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder="например, КОРЮШКА"
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white/70 px-3 py-2 text-lg"
              />
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full bg-ink/10 px-4 py-2 text-sm hover:bg-ink/20">
            Отмена
          </button>
          <button
            type="button"
            disabled={!canOffer}
            onClick={submit}
            className="font-heading rounded-full px-4 py-2 text-base font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: myFish.accent }}
          >
            Предложить
          </button>
        </div>
      </div>
    </div>
  );
}
