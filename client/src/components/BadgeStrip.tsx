import { motion, AnimatePresence } from 'framer-motion';
import * as Popover from '@radix-ui/react-popover';
import {
  Trophy,
  Medal,
  Target,
  Ruler,
  Sparkle,
  Handshake,
  type Icon,
} from '@phosphor-icons/react';
import type { BadgeKind } from '@shared/types';

type BadgeMeta = {
  Icon: Icon;
  title: string;
  description: string;
  /** Solid pastel-paper background tint */
  bg: string;
  /** Inset ring & icon colour — the badge's "ink" colour */
  ink: string;
  weight: 'duotone' | 'fill' | 'bold';
  rotation: number;
};

const META: Record<BadgeKind, BadgeMeta> = {
  gold: {
    Icon: Trophy,
    title: 'Золото',
    description: 'Первое место по очкам',
    bg: '#fbe9b0',
    ink: '#a37510',
    weight: 'fill',
    rotation: -4,
  },
  silver: {
    Icon: Medal,
    title: 'Серебро',
    description: 'Второе место по очкам',
    bg: '#dde4ea',
    ink: '#4a5b6a',
    weight: 'fill',
    rotation: 3,
  },
  bronze: {
    Icon: Medal,
    title: 'Бронза',
    description: 'Третье место по очкам',
    bg: '#e6c8b8',
    ink: '#8b4a3c',
    weight: 'fill',
    rotation: -2,
  },
  bingo: {
    Icon: Target,
    title: 'Бинго',
    description: 'Все 7 фишек за один ход (+10)',
    bg: '#bfe1e2',
    ink: '#1f5b62',
    weight: 'duotone',
    rotation: 4,
  },
  longWord: {
    Icon: Ruler,
    title: 'Длинное слово',
    description: 'Слово из 7 букв и больше',
    bg: '#d8e2ec',
    ink: '#36586e',
    weight: 'duotone',
    rotation: -3,
  },
  bigMove: {
    Icon: Sparkle,
    title: 'Крупный ход',
    description: 'Ход на 50 очков и больше',
    bg: '#ead9c8',
    ink: '#8b4a3c',
    weight: 'fill',
    rotation: 2,
  },
  helper: {
    Icon: Handshake,
    title: 'Помощник',
    description: 'Больше всего подсказок',
    bg: '#c2d6d4',
    ink: '#3a6b5e',
    weight: 'duotone',
    rotation: -3,
  },
};

const ORDER: BadgeKind[] = ['gold', 'silver', 'bronze', 'bingo', 'longWord', 'bigMove', 'helper'];

type Props = { badges: BadgeKind[] };

export function BadgeStrip({ badges }: Props) {
  if (badges.length === 0) return null;
  const counts = new Map<BadgeKind, number>();
  for (const b of badges) counts.set(b, (counts.get(b) ?? 0) + 1);
  const ordered = ORDER.filter((k) => counts.has(k));

  return (
    <div className="my-3 flex flex-wrap items-center gap-2.5">
      <AnimatePresence initial={false}>
        {ordered.map((k) => (
          <BadgeChip key={k} kind={k} count={counts.get(k)!} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function BadgeChip({ kind, count }: { kind: BadgeKind; count: number }) {
  const meta = META[kind];
  const { Icon: Glyph } = meta;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <motion.button
          type="button"
          aria-label={`${meta.title}${count >= 2 ? ` ×${count}` : ''}`}
          initial={{ scale: 0, rotate: 0, opacity: 0 }}
          animate={{ scale: 1, rotate: meta.rotation, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.12, rotate: 0, transition: { type: 'spring', stiffness: 400, damping: 18 } }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22, mass: 0.8 }}
          className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          style={{
            background: meta.bg,
            boxShadow: `inset 0 0 0 1.5px ${meta.ink}66, 0 2px 0 rgba(60,50,35,0.06), 0 6px 14px rgba(60,50,35,0.12)`,
          }}
        >
          <Glyph size={24} weight={meta.weight} color={meta.ink} />
          {count >= 2 && (
            <span
              className="font-heading absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-sm font-bold leading-none tabular-nums text-white"
              style={{
                background: meta.ink,
                boxShadow: '0 0 0 2px var(--color-panel), 0 1px 2px rgba(60,50,35,0.18)',
              }}
            >
              {count}
            </span>
          )}
        </motion.button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={10}
          className="z-50 w-64 overflow-hidden rounded-2xl p-4"
          style={{
            background: 'var(--color-panel)',
            boxShadow: '0 14px 36px rgba(40,30,15,0.25), 0 0 0 1px rgba(60,50,35,0.08)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{
                background: meta.bg,
                boxShadow: `inset 0 0 0 2px ${meta.ink}55, inset 0 1px 1px rgba(255,255,255,0.55)`,
              }}
            >
              <Glyph size={26} weight={meta.weight} color={meta.ink} />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className="font-heading font-bold leading-none"
                  style={{ fontSize: 22, color: meta.ink }}
                >
                  {meta.title}
                </p>
                {count >= 2 && (
                  <span
                    className="font-heading rounded-full px-2 py-0.5 text-sm font-bold tabular-nums text-white"
                    style={{ background: meta.ink }}
                  >
                    ×{count}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm italic leading-snug text-ink-soft">
                {meta.description}
              </p>
            </div>
          </div>
          <Popover.Arrow style={{ fill: 'var(--color-panel)' }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
