import { useEffect, useRef } from 'react';
import type { GameEvent, GameState } from '@shared/types';

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
  }
}

// Best-effort feminine ending for "помог/помогла". Names ending in 'а' or 'я' get the feminine form.
function femEnding(name: string): string {
  const last = name.trim().slice(-1).toLowerCase();
  return last === 'а' || last === 'я' ? 'ла' : '';
}
