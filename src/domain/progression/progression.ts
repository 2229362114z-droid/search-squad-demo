import type { EconomyConfig } from '@/src/config/types';

export type GrowthTrack = 'damage' | 'reduction' | 'foresight';
export interface GrowthLevels {
  readonly damage: number;
  readonly reduction: number;
  readonly foresight: number;
}
export const growthNames: Readonly<Record<GrowthTrack, string>> = {
  damage: '破邪',
  reduction: '固元',
  foresight: '预知',
};

/** Old saves start at zero; malformed levels never grant unintended bonuses. */
export function normalizeGrowth(
  value: unknown,
  maximum: number,
  foresightMaximum = 3,
): GrowthLevels {
  const data =
    value && typeof value === 'object'
      ? (value as Partial<Record<GrowthTrack, unknown>>)
      : {};
  const level = (v: unknown, limit: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0
      ? Math.min(limit, v)
      : 0;
  return {
    damage: level(data.damage, maximum),
    reduction: level(data.reduction, maximum),
    foresight: level(data.foresight, foresightMaximum),
  };
}

export function growthUpgradeCosts(
  track: GrowthTrack,
  config: EconomyConfig['growth'],
): readonly number[] {
  return track === 'foresight'
    ? config.foresightUpgradeCosts
    : config.upgradeCosts;
}

/** Level 0 reveals complete information for adjacent rooms; each level adds one graph step. */
export function foresightRadius(level: number): number {
  return Math.min(4, Math.max(1, Math.floor(level) + 1));
}

export function growthRatio(
  level: number,
  config: EconomyConfig['growth'],
): number {
  return (
    Math.min(config.upgradeCosts.length, Math.max(0, level)) *
    config.effectPerLevel
  );
}
