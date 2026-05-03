import { useGameStore } from '../store.js';

export function ErrorBanner() {
  const lastError = useGameStore((s) => s.lastError);
  const warning = useGameStore((s) => s.warning);
  if (lastError === null && warning === null) return null;
  return (
    <div className="mt-3 flex w-full flex-col gap-2">
      {warning !== null && (
        <div
          className="font-heading rounded-xl px-4 py-2.5 text-base font-semibold leading-tight"
          style={{
            background: 'rgba(230,207,148,0.45)',
            color: '#7a5c10',
            boxShadow: 'inset 0 0 0 1.5px rgba(122,92,16,0.35)',
          }}
        >
          {warning}
        </div>
      )}
      {lastError !== null && (
        <div
          className="font-heading rounded-xl px-4 py-2.5 text-base font-semibold leading-tight"
          style={{
            background: 'rgba(177,77,44,0.14)',
            color: 'var(--color-accent)',
            boxShadow: 'inset 0 0 0 1.5px rgba(177,77,44,0.4)',
          }}
        >
          {lastError}
        </div>
      )}
    </div>
  );
}
