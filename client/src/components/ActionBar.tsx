import { useState } from 'react';
import { useGameStore } from '../store.js';
import { sendEndGame, sendRevertLastTurn } from '../ws.js';
import { ConfirmModal } from './ConfirmModal.js';

type Confirm = null | 'endGame' | 'revert';

export function ActionBar() {
  const state = useGameStore((s) => s.state);
  const identity = useGameStore((s) => s.identity);
  const [confirm, setConfirm] = useState<Confirm>(null);

  if (state === null || identity === null) return null;
  if (state.phase !== 'playing') return null;

  const me = state.players[identity.slot]!;
  // Only the player who placed the last word can revert — not after pass / redraw / blank-claim.
  const lastEvent = state.events[state.events.length - 1];
  const canRevertMove =
    me.canRevert && lastEvent !== undefined && lastEvent.kind === 'move' && lastEvent.slot === identity.slot;

  function fire() {
    if (confirm === 'endGame') sendEndGame();
    if (confirm === 'revert') sendRevertLastTurn();
    setConfirm(null);
  }

  const pillCls =
    'rounded-full px-4 py-2 text-sm font-medium text-ink shadow-[0_1px_0_rgba(60,50,35,0.06),0_2px_6px_rgba(60,50,35,0.08)] disabled:opacity-40 hover:brightness-95';
  const pillStyle: React.CSSProperties = { background: 'var(--color-panel)' };

  return (
    <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
      {canRevertMove && (
        <button
          type="button"
          className={pillCls}
          style={pillStyle}
          onClick={() => setConfirm('revert')}
        >Отменить ход</button>
      )}

      <div className="basis-full" />

      <button
        type="button"
        className="font-heading w-full rounded-full px-4 py-3 text-xl font-semibold tracking-wide text-white shadow-[0_2px_0_rgba(60,50,35,0.06),0_6px_18px_rgba(60,50,35,0.10)]"
        style={{ background: 'var(--color-accent)' }}
        onClick={() => setConfirm('endGame')}
      >Завершить игру</button>

      <ConfirmModal
        open={confirm === 'endGame'}
        title="Завершить игру?"
        message="Игра закончится, очки будут зафиксированы."
        confirmLabel="Завершить"
        onConfirm={fire}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        open={confirm === 'revert'}
        title="Отменить последний ход?"
        message="Состояние вернётся к моменту перед твоим действием."
        confirmLabel="Отменить ход"
        onConfirm={fire}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
