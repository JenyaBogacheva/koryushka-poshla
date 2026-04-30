import raw from './tiles-ru.json' with { type: 'json' };

export type TileDistributionEntry = {
  letter: string;
  count: number;
  points: number;
  isBlank: boolean;
};

const NORMALISED: TileDistributionEntry[] = (raw as Array<{
  letter: string;
  count: number;
  points: number;
  isBlank?: boolean;
}>).map((e) => ({
  letter: e.letter,
  count: e.count,
  points: e.points,
  isBlank: e.isBlank === true,
}));

export function loadTileDistribution(): TileDistributionEntry[] {
  return NORMALISED.map((e) => ({ ...e })); // shallow copy so callers can't mutate the cache
}

export function totalTileCount(dist: TileDistributionEntry[]): number {
  return dist.reduce((sum, e) => sum + e.count, 0);
}
