import { useEffect, useRef, useState } from 'react';
import type { DrawForOrderRecord, GameEvent, GameState, Slot } from '@shared/types';
import { fishForSlot } from '../fish.js';
import { useGameStore } from '../store.js';
import { sendAttributeHelper } from '../ws.js';

type Props = { state: GameState };

export function MoveLog({ state }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const identity = useGameStore((s) => s.identity);
  useEffect(() => {
    if (ref.current === null) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.events.length]);

  const nameOf = (slot: number): string => state.players[slot]?.name || `Слот ${slot}`;

  // The latest move is editable iff:
  //   - it's the last event (no helper yet), or
  //   - the last event is the assist for it (i.e. helper already attributed)
  // AND it belongs to the viewer.
  const editableMoveIndex: number | null = (() => {
    if (identity === null) return null;
    const events = state.events;
    if (events.length === 0) return null;
    const last = events[events.length - 1]!;
    if (last.kind === 'move' && last.slot === identity.slot) return events.length - 1;
    if (last.kind === 'assist' && last.forMoveIndex === events.length - 2) {
      const prev = events[events.length - 2];
      if (prev?.kind === 'move' && prev.slot === identity.slot) return events.length - 2;
    }
    return null;
  })();

  const otherPlayers =
    identity === null
      ? []
      : ([0, 1, 2] as Slot[])
          .filter((s) => s !== identity.slot)
          .map((s) => ({ slot: s, name: nameOf(s) }));

  return (
    <div
      className="flex flex-1 min-h-[120px] flex-col overflow-hidden rounded-2xl p-4 text-sm text-ink"
      style={{
        background: 'var(--color-panel)',
        boxShadow: '0 2px 0 rgba(60,50,35,0.06), 0 6px 18px rgba(60,50,35,0.08)',
      }}
      data-testid="move-log"
    >
      <div className="mb-2 flex shrink-0 items-baseline justify-between">
        <span className="font-heading font-bold leading-none" style={{ fontSize: 28 }}>Ходы</span>
        <span className="text-sm uppercase tracking-wider text-ink-soft">история</span>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {state.events.length === 0 ? (
          <p className="text-ink/50">Ещё нет ходов</p>
        ) : (
          <ol className="space-y-1">
            {state.events.map((e, i) => {
              if (e.kind === 'drawForOrder') return null;
              // The affordance owns the assist row when it's the editable move's assist.
              if (
                editableMoveIndex !== null &&
                i === editableMoveIndex + 1 &&
                e.kind === 'assist'
              ) {
                return null;
              }
              const showAffordance =
                editableMoveIndex !== null && i === editableMoveIndex && e.kind === 'move';
              return (
                <li key={i}>
                  {renderEvent(e, nameOf)}
                  {showAffordance && e.kind === 'move' && (
                    <HelperAffordance
                      currentHelper={e.helperSlot}
                      otherPlayers={otherPlayers}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

type HelperAffordanceProps = {
  currentHelper: Slot | null;
  otherPlayers: { slot: Slot; name: string }[];
};

function HelperAffordance({ currentHelper, otherPlayers }: HelperAffordanceProps) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div className="ml-7 mt-1 flex flex-col gap-1 text-sm">
        <span className="text-sm uppercase tracking-wider text-ink-soft">Кто помог?</span>
        <button
          type="button"
          onClick={() => {
            sendAttributeHelper(null);
            setExpanded(false);
          }}
          className="text-left text-ink-soft hover:text-ink"
        >
          никто
        </button>
        {otherPlayers.map((p) => {
          const f = fishForSlot(p.slot);
          return (
            <button
              key={p.slot}
              type="button"
              onClick={() => {
                sendAttributeHelper(p.slot);
                setExpanded(false);
              }}
              className="flex items-center gap-1.5 text-left hover:underline"
            >
              <img src={f.src} alt="" aria-hidden style={{ width: 16, height: 'auto' }} />
              <span style={{ color: f.deep, fontWeight: 600 }}>{p.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="self-start text-sm text-ink-soft hover:text-ink"
        >
          отмена
        </button>
      </div>
    );
  }

  if (currentHelper !== null) {
    const helperPlayer = otherPlayers.find((p) => p.slot === currentHelper);
    if (helperPlayer === undefined) return null;
    const f = fishForSlot(helperPlayer.slot);
    return (
      <div className="ml-7 mt-0.5 flex items-center gap-1.5 text-ink/60">
        <span>↳</span>
        <img src={f.src} alt="" aria-hidden style={{ width: 16, height: 'auto' }} />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="hover:underline"
          style={{ color: f.deep, fontWeight: 600 }}
        >
          {helperPlayer.name}
        </button>
        <span>{isFemName(helperPlayer.name) ? 'помогла' : 'помог'} — +5</span>
        <button
          type="button"
          onClick={() => sendAttributeHelper(null)}
          className="ml-1 text-sm text-ink-soft underline hover:text-ink"
        >
          убрать
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className="ml-7 mt-0.5 text-sm text-ink-soft hover:text-ink"
    >
      + кто помог?
    </button>
  );
}

export function FishStamp({ slot }: { slot: Slot }) {
  const fish = fishForSlot(slot);
  return (
    <img
      src={fish.src}
      alt=""
      aria-hidden
      className="mt-0.5 shrink-0"
      style={{ width: 22, height: 'auto' }}
    />
  );
}

function PlayerName({ slot, nameOf }: { slot: Slot; nameOf: (s: number) => string }) {
  const fish = fishForSlot(slot);
  return <strong style={{ color: fish.deep }}>{nameOf(slot)}</strong>;
}

function renderEvent(e: GameEvent, nameOf: (s: number) => string): React.ReactNode {
  switch (e.kind) {
    case 'move': {
      const words = e.wordsFormed.map((w) => w.word).join(', ');
      return (
        <div className="flex items-start gap-2">
          <FishStamp slot={e.slot} />
          <div className="flex-1 min-w-0">
            <PlayerName slot={e.slot} nameOf={nameOf} /> — <span className="font-heading text-base font-semibold">{words || '—'}</span> — <span className="tabular-nums font-bold">{e.totalScore}</span>
            {e.bingoBonus && <span className="ml-1 rounded bg-prem-tl/40 px-1 text-sm">+10 бинго</span>}
            {e.dictionaryWarnings.length > 0 && (
              <div className="text-sm text-ink-soft">не в словаре: {e.dictionaryWarnings.join(', ')}</div>
            )}
          </div>
        </div>
      );
    }
    case 'assist':
      return (
        <span className="ml-7 text-ink/60">
          ↳ помог{femEnding(nameOf(e.fromSlot))} {toDative(nameOf(e.toSlot))} — +{e.points}
        </span>
      );
    case 'pass':
      return (
        <div className="flex items-start gap-2">
          <FishStamp slot={e.slot} />
          <div><PlayerName slot={e.slot} nameOf={nameOf} /> — пас</div>
        </div>
      );
    case 'redraw': {
      const fem = isFemName(nameOf(e.slot));
      const text =
        e.reason === 'swapAll'
          ? `поменя${fem ? 'ла' : 'л'} буквы`
          : `обмен (${e.reason === 'allVowels' ? 'все гласные' : 'все согласные'}, ${e.tileCount})`;
      return (
        <div className="flex items-start gap-2">
          <FishStamp slot={e.slot} />
          <div><PlayerName slot={e.slot} nameOf={nameOf} /> — {text}</div>
        </div>
      );
    }
    case 'claimBlank': {
      const cell = `${'abcdefghijklmno'[e.col]}${e.row + 1}`;
      return (
        <div className="flex items-start gap-2">
          <FishStamp slot={e.slot} />
          <div><PlayerName slot={e.slot} nameOf={nameOf} /> — ★→{e.letterAs} на {cell}</div>
        </div>
      );
    }
    case 'endGame': {
      const cause =
        e.cause === 'playerEnded' ? `${nameOf(e.slot)} завершил${isFemName(nameOf(e.slot)) ? 'а' : ''}`
        : e.cause === 'bagEmptyAndRackEmpty' ? 'закончились буквы'
        : 'шесть пасов';
      return <em className="text-ink/70">Корюшка пришла! ({cause})</em>;
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
      <div className="text-sm uppercase tracking-wide text-ink/50">Жребий — порядок ходов</div>
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
              <div className={`text-sm ${position === 1 ? 'font-semibold text-ink' : 'text-ink/60'}`}>
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
  return isFemName(name) ? 'ла' : '';
}

// Russian-style gender heuristic: names ending in а/я are feminine — except
// for these family-game names, which decline like а-stem feminines but are
// grammatically masculine (Папа, Дядя, Илья, Никита, …).
const MASC_OVERRIDES = new Set(['папа', 'дядя', 'илья', 'никита']);

function isFemName(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  if (MASC_OVERRIDES.has(trimmed)) return false;
  const last = trimmed.slice(-1);
  return last === 'а' || last === 'я';
}

// Approximate Russian dative case for the family-game names
// (Мама → Маме, Папа → Папе, Женя → Жене). For other names, return as-is.
function toDative(name: string): string {
  const trimmed = name.trim();
  const last = trimmed.slice(-1).toLowerCase();
  if (last === 'а') return trimmed.slice(0, -1) + 'е';
  if (last === 'я') return trimmed.slice(0, -1) + 'е';
  return trimmed;
}
