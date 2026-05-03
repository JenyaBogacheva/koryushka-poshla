import type { Slot } from '@shared/types';

export type FishColor = 'yellow' | 'teal' | 'brown';

export type FishTheme = {
  color: FishColor;
  src: string;
  accent: string;
  soft: string;
  deep: string;
};

const FISH: Record<FishColor, FishTheme> = {
  yellow: {
    color: 'yellow',
    src: '/fish/solid-yellow.png',
    accent: '#e8b526',
    soft: '#fbe9b0',
    deep: '#a37510',
  },
  teal: {
    color: 'teal',
    src: '/fish/solid-teal.png',
    accent: '#2f8a93',
    soft: '#bfe1e2',
    deep: '#1f5b62',
  },
  brown: {
    color: 'brown',
    src: '/fish/solid-brown.png',
    accent: '#8b4a3c',
    soft: '#e6c8b8',
    deep: '#5a2e22',
  },
};

const SLOT_TO_COLOR: Record<Slot, FishColor> = { 0: 'yellow', 1: 'teal', 2: 'brown' };

export function fishForSlot(slot: Slot): FishTheme {
  return FISH[SLOT_TO_COLOR[slot]];
}
