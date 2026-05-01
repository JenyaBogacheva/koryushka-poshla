import { useState } from 'react';
import { useGameStore } from '../store.js';
import { sendPass, sendRedraw, sendEndGame, sendRevertLastTurn } from '../ws.js';
import { ConfirmModal } from './ConfirmModal.js';

type Confirm = null | 'pass' | 'endGame' | 'revert';

export function ActionBar() {
  const state = useGameStore((s) => s.state);
  const identity = useGameStore((s) => s.identity);
  const [confirm, setConfirm] = useState<Confirm>(null);

  if (state === null || identity === null) return null;
  if (state.phase !== 'playing') return null;

  const me = state.players[identity.slot]!;
  const isMyTurn = state.turnIndex === identity.slot;

  function fire() {
    if (confirm === 'pass') sendPass();
    if (confirm === 'endGame') sendEndGame();
    if (confirm === 'revert') sendRevertLastTurn();
    setConfirm(null);
  }

  return (
    <div className="flex flex-wrap gap-2 items-center mt-3">
      <button
        type="button"
        disabled={!isMyTurn}
        className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
        onClick={() => setConfirm('pass')}
      >Пропустить</button>

      {me.redrawEligible && isMyTurn && (
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-amber-400 bg-amber-50 hover:bg-amber-100"
          onClick={() => sendRedraw()}
        >Замена (всё гласные/согласные)</button>
      )}

      {me.canRevert && (
        <button
          type="button"
          className="px-3 py-1.5 rounded border border-sky-400 bg-sky-50 hover:bg-sky-100"
          onClick={() => setConfirm('revert')}
        >Отменить ход</button>
      )}

      <div className="flex-1" />

      <button
        type="button"
        className="px-3 py-1.5 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
        onClick={() => setConfirm('endGame')}
      >Завершить игру</button>

      <ConfirmModal
        open={confirm === 'pass'}
        title="Пропустить ход?"
        message="Ваш ход будет передан следующему игроку."
        onConfirm={fire}
        onCancel={() => setConfirm(null)}
      />
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
        message="Состояние вернётся к моменту перед вашим действием."
        confirmLabel="Отменить ход"
        onConfirm={fire}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
