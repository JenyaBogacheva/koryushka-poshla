type Props = { count: number; nextLetter?: string };

export function BagIndicator({ count, nextLetter }: Props) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-2xl px-4 py-3"
      style={{
        background: 'var(--color-panel)',
        boxShadow: '0 2px 0 rgba(60,50,35,0.06), 0 6px 18px rgba(60,50,35,0.08)',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Bobbing fish carrying a tile on its back */}
        <div className="relative shrink-0 overflow-hidden" style={{ width: 100, height: 70 }}>
          <img
            src="/fish/solid-brown.png"
            alt=""
            className="fish-bob absolute"
            style={{ width: 110, left: -5, top: 8 }}
          />
          <div
            className="fish-bob absolute"
            style={{ top: 4, left: 34, transform: 'rotate(-8deg)' }}
          >
            <div
              className="font-heading flex items-center justify-center rounded-md bg-tile font-bold"
              style={{
                width: 28,
                height: 28,
                fontSize: 18,
                color: '#1f2a30',
                boxShadow:
                  '0 0 0 1.5px rgba(45,36,25,0.55), 0 2px 4px rgba(40,30,15,0.35), 0 6px 12px rgba(40,30,15,0.22), inset 0 0 0 1px rgba(255,255,255,0.7)',
              }}
            >
              {nextLetter ?? '?'}
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="text-xs uppercase tracking-wider text-ink-soft">В мешке</div>
          <div className="font-heading font-bold leading-none" style={{ fontSize: 36 }}>
            {count}
          </div>
          <div className="mt-0.5 text-xs text-ink-soft">букв осталось</div>
        </div>
      </div>
    </div>
  );
}
