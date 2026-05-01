import { useGameStore } from '../store.js';

export function ErrorBanner() {
  const lastError = useGameStore((s) => s.lastError);
  if (lastError === null) return null;
  return (
    <div className="mt-3 rounded border border-terracotta/60 bg-terracotta/20 px-3 py-2 text-sm text-ink">
      {lastError}
    </div>
  );
}
