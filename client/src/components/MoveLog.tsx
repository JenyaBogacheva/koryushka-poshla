import { useEffect, useRef } from 'react';
import type { DrawForOrderRecord, GameEvent, GameState } from '@shared/types';

type Props = { state: GameState };

export function MoveLog({ state }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current === null) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.events.length]);

  const nameOf = (slot: number): string => state.players[slot]?.name || `Слот ${slot}`;

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 overflow-y-auto rounded-md bg-tile p-2 text-sm text-ink shadow-sm"
      data-testid="move-log"
    >
      {state.events.length === 0 ? (
        <p className="text-ink/50">Ещё нет ходов</p>
      ) : (
        <ol className="space-y-0.5">
          {state.events.map((e, i) => (
            <li key={i}>{renderEvent(e, nameOf)}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function renderEvent(e: GameEvent, nameOf: (s: number) => string): React.ReactNode {
  switch (e.kind) {
    case 'move': {
      const words = e.wordsFormed.map((w) => w.word).join(', ');
      return (
        <span>
          <strong>{nameOf(e.slot)}</strong> • {words || '—'} — <span className="tabular-nums">{e.totalScore}</span>
          {e.bingoBonus && <span className="ml-1 rounded bg-sage px-1 text-xs">+10 бинго</span>}
          {e.dictionaryWarnings.length > 0 && (
            <span className="ml-2 text-xs text-amber-700/80">
              (не в словаре: {e.dictionaryWarnings.join(', ')})
            </span>
          )}
        </span>
      );
    }
    case 'assist':
      return (
        <span className="ml-4 text-ink/60">↳ помог{femEnding(nameOf(e.toSlot))} {nameOf(e.toSlot)} — +{e.points}</span>
      );
    case 'pass':
      return <span><strong>{nameOf(e.slot)}</strong> • пас</span>;
    case 'redraw': {
      const reason = e.reason === 'allVowels' ? 'все гласные' : 'все согласные';
      return <span><strong>{nameOf(e.slot)}</strong> • обмен ({reason}, {e.tileCount})</span>;
    }
    case 'claimBlank': {
      const cell = `${'abcdefghijklmno'[e.col]}${e.row + 1}`;
      return <span><strong>{nameOf(e.slot)}</strong> • ★→{e.letterAs} на {cell}</span>;
    }
    case 'endGame': {
      const cause =
        e.cause === 'playerEnded' ? `${nameOf(e.slot)} завершил`
        : e.cause === 'bagEmptyAndRackEmpty' ? 'закончились буквы'
        : 'шесть пасов';
      return <em className="text-ink/70">Игра окончена ({cause})</em>;
    }
    case 'revert':
      return <span className="ml-4 text-ink/50 line-through">↳ отменено</span>;
    case 'drawForOrder':
      return <DrawForOrderEntry ev={e} nameOf={nameOf} />;
  }
}

function DrawForOrderEntry({
  ev,
  nameOf,
}: {
  ev: DrawForOrderRecord;
  nameOf: (slot: number) => string;
}): React.ReactNode {
  // Turn order: firstSlot, (firstSlot+1)%3, (firstSlot+2)%3 — matches the cycle in submitMove.
  const ordered = [0, 1, 2].map((i) => {
    const slot = ((ev.firstSlot + i) % 3) as 0 | 1 | 2;
    const draw = ev.draws.find((d) => d.slot === slot) ?? null;
    return { slot, draw, position: i + 1 };
  });
  return (
    <div className="my-1 rounded-md border border-ink/10 bg-bg/40 px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-ink/50">Жребий — порядок ходов</div>
      <div className="mt-1 flex items-center gap-1.5">
        {ordered.map(({ slot, draw, position }, idx) => (
          <div key={slot} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center gap-0.5">
              <div className="relative flex h-7 w-7 items-center justify-center rounded bg-tile text-base font-semibold text-ink shadow-sm">
                {draw?.letter ?? '★'}
                <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-bg">
                  {position}
                </span>
              </div>
              <div className={`text-[10px] ${position === 1 ? 'font-semibold text-ink' : 'text-ink/60'}`}>
                {nameOf(slot)}
              </div>
            </div>
            {idx < ordered.length - 1 && <span className="text-ink/30">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Best-effort feminine ending for "помог/помогла". Names ending in 'а' or 'я' get the feminine form.
function femEnding(name: string): string {
  const last = name.trim().slice(-1).toLowerCase();
  return last === 'а' || last === 'я' ? 'ла' : '';
}
