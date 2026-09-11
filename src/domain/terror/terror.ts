import type { TerrorConfig } from '@/src/config/types';

export interface PartyMemberHealth {
  readonly id: string;
  readonly health: number;
  readonly maxHealth: number;
}

export interface TerrorMoveResult {
  readonly previousTerror: number;
  readonly nextTerror: number;
  readonly damageByMember: Readonly<Record<string, number>>;
  readonly wouldDown: readonly string[];
}

export function previewTerrorMove(
  terror: number,
  party: readonly PartyMemberHealth[],
  config: TerrorConfig,
): TerrorMoveResult {
  const isAlreadyFull = terror >= config.maximum;
  const damageByMember: Record<string, number> = {};
  const wouldDown: string[] = [];

  if (isAlreadyFull) {
    for (const member of party) {
      if (member.health <= 0) continue;
      const damage = member.maxHealth * config.fullDamageRatio;
      damageByMember[member.id] = damage;
      if (damage >= member.health) wouldDown.push(member.id);
    }
  }

  return {
    previousTerror: terror,
    nextTerror: isAlreadyFull
      ? config.maximum
      : Math.min(config.maximum, terror + config.movementGain),
    damageByMember,
    wouldDown,
  };
}
