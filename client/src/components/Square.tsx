import type { Cell, Premium } from '@shared/types';
import { Tile } from './Tile.js';

const PREMIUM_BG: Record<Exclude<Premium, null>, string> = {
  TW: 'bg-terracotta/70',
  DW: 'bg-peach',
  TL: 'bg-sage',
  DL: 'bg-sage-light',
  CENTER: 'bg-peach',
};

const PREMIUM_LABEL: Record<Exclude<Premium, null>, string> = {
  TW: '3W',
  DW: '2W',
  TL: '3L',
  DL: '2L',
  CENTER: '★',
};

type Props = {
  cell: Cell | null;
  premium: Premium;
  size: number;
};

export function Square({ cell, premium, size }: Props) {
  const base = 'relative flex items-center justify-center border border-ink/10';
  const bg = cell ? 'bg-bg' : (premium ? PREMIUM_BG[premium] : 'bg-bg');
  return (
    <div className={`${base} ${bg}`} style={{ width: size, height: size }}>
      {cell ? (
        <Tile cell={cell} size={size - 4} />
      ) : premium ? (
        <span className="text-[10px] font-medium text-ink/60">{PREMIUM_LABEL[premium]}</span>
      ) : null}
    </div>
  );
}
