import type { BadgeKind } from '@shared/types';

type BadgeMeta = { emoji: string; tooltip: string };

const META: Record<BadgeKind, BadgeMeta> = {
  bingo: { emoji: '🎯', tooltip: 'Бинго — все 7 фишек за один ход' },
  longWord: { emoji: '📏', tooltip: 'Длинное слово — 7 букв и больше' },
  bigMove: { emoji: '💥', tooltip: 'Крупный ход — 50 очков и больше' },
  helper: { emoji: '🤝', tooltip: 'Помощник — больше всего подсказок' },
  gold: { emoji: '🥇', tooltip: 'Золото — первое место' },
  silver: { emoji: '🥈', tooltip: 'Серебро — второе место' },
  bronze: { emoji: '🥉', tooltip: 'Бронза — третье место' },
};

const ORDER: BadgeKind[] = ['gold', 'silver', 'bronze', 'bingo', 'longWord', 'bigMove', 'helper'];

type Props = { badges: BadgeKind[] };

export function BadgeStrip({ badges }: Props) {
  if (badges.length === 0) return null;
  const counts = new Map<BadgeKind, number>();
  for (const b of badges) counts.set(b, (counts.get(b) ?? 0) + 1);

  const ordered = ORDER.filter((k) => counts.has(k));

  return (
    <div className="mt-1 flex flex-wrap gap-1 text-base leading-none">
      {ordered.map((k) => {
        const n = counts.get(k)!;
        const meta = META[k];
        return (
          <span key={k} title={meta.tooltip} className="badge-pop inline-flex items-center">
            <span aria-label={meta.tooltip}>{meta.emoji}</span>
            {n >= 2 && <span className="ml-0.5 text-xs tabular-nums">×{n}</span>}
          </span>
        );
      })}
    </div>
  );
}
