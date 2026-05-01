import type { Player } from '@shared/types';

type Props = { players: readonly Player[]; mySlot: number };

export function WaitingRoom({ players, mySlot }: Props) {
  const onlineCount = players.filter((p) => p.connected).length;
  return (
    <main className="flex h-full flex-col items-center justify-center gap-5 p-8 text-ink">
      <h1 className="text-2xl font-semibold">Ждём игроков</h1>
      <p className="text-sm text-ink/60">
        {onlineCount} / 3 готовы
      </p>
      <div className="flex w-full max-w-md flex-col gap-3">
        {players.map((p) => (
          <div
            key={p.slot}
            className={[
              'flex items-center justify-between rounded border px-3 py-3 text-base',
              p.connected ? 'border-sage bg-sage-light/40' : 'border-ink/20 bg-tile/60',
            ].join(' ')}
          >
            <span className="font-semibold">
              {p.name}
              {p.slot === mySlot && <span className="ml-2 text-xs font-normal text-ink/60">(это ты)</span>}
            </span>
            <span className="flex items-center gap-2 text-sm">
              <span
                className={[
                  'inline-block h-2.5 w-2.5 rounded-full',
                  p.connected ? 'bg-sage' : 'bg-ink/30',
                ].join(' ')}
              />
              {p.connected ? 'онлайн' : 'ждём'}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
