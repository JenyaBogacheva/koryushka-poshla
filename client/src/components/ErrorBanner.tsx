import { useGameStore } from '../store.js';

export function ErrorBanner() {
  const lastError = useGameStore((s) => s.lastError);
  const warning = useGameStore((s) => s.warning);
  if (lastError === null && warning === null) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {warning !== null && (
        <div className="rounded border border-amber-500/60 bg-amber-200/40 px-3 py-2 text-sm text-ink">
          {warning}
        </div>
      )}
      {lastError !== null && (
        <div className="rounded border border-terracotta/60 bg-terracotta/20 px-3 py-2 text-sm text-ink">
          {lastError}
        </div>
      )}
    </div>
  );
}
