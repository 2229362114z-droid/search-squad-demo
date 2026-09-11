import type { CombatItemConfig, EnemyNature } from '@/src/config/types';
import type { HeroCombatantInput } from '@/src/domain/combat';
import { seedToRandomState, randomInteger } from '@/src/domain/combat/random';

export const MAX_RELICS = 5;
export const natureLabels: Readonly<Record<EnemyNature, string>> = {
  physical: '红·实体',
  ghost: '蓝·幽灵',
};
export const relicNatureLabels: Readonly<Record<EnemyNature, string>> = {
  physical: '实',
  ghost: '幽',
};
export interface RelicInstance {
  readonly instanceId: string;
  readonly itemId: string;
}
export interface CombatItemBonuses {
  readonly characterBonuses?: Readonly<Record<string, CombatItemBonuses>>;
  readonly personalReductionRatio?: number;
  readonly shieldPowerRatio?: number;
  readonly teamDamageRatio: number;
  readonly teamDamageReductionRatio: number;
  readonly basicDamageRatio: number;
  readonly attackSpeedRatio: number;
  readonly lifestealRatio: number;
  readonly energyGainRatio: number;
  readonly ultimateDamageRatio: number;
  readonly ultimateShield: number;
  readonly ultimateShieldDurationMs: number;
  readonly stunBonusMs: number;
}
export function createRelicChoices(
  seed: string | number,
  items: readonly CombatItemConfig[],
  mixed = false,
): readonly string[] {
  let random = seedToRandomState(`${seed}:relic-choices`);
  const remaining = [...items];
  const picked: string[] = [];
  for (let i = 0; i < 3 && remaining.length; i++) {
    const pool =
      mixed && i < 2
        ? remaining.filter(
            (item) => item.nature === (i === 0 ? 'physical' : 'ghost'),
          )
        : remaining;
    if (!pool.length) continue;
    const roll = randomInteger(random, 0, pool.length - 1);
    random = roll.state;
    const item = pool[roll.value]!;
    picked.push(item.id);
    remaining.splice(remaining.indexOf(item), 1);
  }
  return picked;
}
export function createStartingRelicChoices(
  seed: number,
  items: readonly CombatItemConfig[],
): readonly string[] {
  return createRelicChoices(seed, items, true);
}
export const relicHeroNames: Readonly<Record<string, string>> = {
  shen_yan: '沈砚',
  hong_wu: '洪武',
  xuan_zhen: '玄真',
  su_ling: '苏绫',
};
export function relicEffectDescription(item: CombatItemConfig): string {
  const e = item.effect;
  const who = item.targetCharacterId
    ? relicHeroNames[item.targetCharacterId]
    : '全队';
  const pct = (ratio: number) => Math.round(ratio * 100) + '%';
  switch (e.type) {
    case 'damage_reduction':
      return who + '战斗承伤-' + pct(e.ratio);
    case 'shield_power':
      return who + '大招给予全队的护盾量+' + pct(e.ratio);
    case 'basic_damage':
      return who + '普攻伤害+' + pct(e.ratio);
    case 'attack_speed':
      return who + '普攻速度+' + pct(e.ratio);
    case 'lifesteal':
      return who + '普攻吸血' + pct(e.ratio);
    case 'energy_gain':
      return who + '普攻与承伤回能+' + pct(e.ratio);
    case 'ultimate_shield':
      return (
        who +
        '释放大招获得' +
        e.amount +
        '点护盾，持续' +
        e.durationMs / 1000 +
        '秒'
      );
    case 'ultimate_power':
      return (
        who +
        '大招伤害+' +
        pct(e.ratio) +
        (e.stunBonusMs ? '，苏绫大招眩晕+' + e.stunBonusMs / 1000 + '秒' : '')
      );
  }
}
export function relicBaseDescription(item: CombatItemConfig): string {
  return `全队伤害+${Math.round(item.baseDamageRatio * 1000) / 10}%，承伤-${Math.round(item.baseReductionRatio * 1000) / 10}%`;
}
export function relicRoomDescription(item: CombatItemConfig): string {
  return `特色全房间生效；基础仅${item.nature === 'physical' ? '红色' : '蓝色'}房间生效`;
}
/** 特色全场生效；基础同色生效。人物专属特色按角色分别聚合。 */
export function aggregateCombatItemBonuses(
  relics: readonly RelicInstance[],
  definitions: ReadonlyMap<string, CombatItemConfig>,
  nature: EnemyNature,
  offNatureBaseRatio = 0,
): CombatItemBonuses {
  const personalItems = new Map<string, CombatItemConfig[]>();
  let personalReductionRatio = 0,
    shieldPowerRatio = 0;
  let teamDamageRatio = 0,
    teamDamageReductionRatio = 0;
  let basicDamageRatio = 0,
    attackSpeedRatio = 0,
    lifestealRatio = 0;
  let energyGainRatio = 0,
    ultimateDamageRatio = 0,
    ultimateShield = 0;
  let ultimateShieldDurationMs = 0,
    stunBonusMs = 0;
  for (const instance of relics) {
    const item = definitions.get(instance.itemId);
    if (!item) continue;
    const baseWeight =
      item.nature === nature ? 1 : Math.max(0, Math.min(1, offNatureBaseRatio));
    teamDamageRatio += item.baseDamageRatio * baseWeight;
    teamDamageReductionRatio += item.baseReductionRatio * baseWeight;
    if (item.targetCharacterId) {
      const list = personalItems.get(item.targetCharacterId) ?? [];
      list.push({
        ...item,
        targetCharacterId: undefined,
        baseDamageRatio: 0,
        baseReductionRatio: 0,
      });
      personalItems.set(item.targetCharacterId, list);
      continue;
    }
    const weight = 1;
    const e = item.effect;
    switch (e.type) {
      case 'damage_reduction':
        personalReductionRatio += e.ratio;
        break;
      case 'shield_power':
        shieldPowerRatio += e.ratio;
        break;
      case 'basic_damage':
        basicDamageRatio += e.ratio * weight;
        break;
      case 'attack_speed':
        attackSpeedRatio += e.ratio * weight;
        break;
      case 'lifesteal':
        lifestealRatio += e.ratio * weight;
        break;
      case 'energy_gain':
        energyGainRatio += e.ratio * weight;
        break;
      case 'ultimate_shield':
        ultimateShield += e.amount * weight;
        ultimateShieldDurationMs = Math.max(
          ultimateShieldDurationMs,
          e.durationMs,
        );
        break;
      case 'ultimate_power':
        ultimateDamageRatio += e.ratio * weight;
        stunBonusMs += e.stunBonusMs * weight;
        break;
    }
  }
  const characterBonuses = Object.fromEntries(
    [...personalItems].map(([id, items]) => [
      id,
      aggregateCombatItemBonuses(
        items.map((item, i) => ({ instanceId: String(i), itemId: item.id })),
        new Map(items.map((item) => [item.id, item])),
        nature,
      ),
    ]),
  );
  return {
    characterBonuses,
    personalReductionRatio: Math.min(0.8, personalReductionRatio),
    shieldPowerRatio,
    teamDamageRatio,
    teamDamageReductionRatio: Math.min(0.8, teamDamageReductionRatio),
    basicDamageRatio,
    attackSpeedRatio,
    lifestealRatio,
    energyGainRatio,
    ultimateDamageRatio,
    ultimateShield,
    ultimateShieldDurationMs,
    stunBonusMs: Math.min(2000, stunBonusMs),
  };
}
export function applyCombatItemBonusesToHeroes(
  heroes: readonly HeroCombatantInput[],
  bonuses: CombatItemBonuses,
): readonly HeroCombatantInput[] {
  return heroes.map((hero) => {
    const own = bonuses.characterBonuses?.[hero.configId];
    const combined = { ...bonuses };
    for (const key of [
      'basicDamageRatio',
      'attackSpeedRatio',
      'lifestealRatio',
      'energyGainRatio',
      'ultimateDamageRatio',
      'ultimateShield',
      'stunBonusMs',
      'personalReductionRatio',
      'shieldPowerRatio',
    ] as const)
      combined[key] = (bonuses[key] ?? 0) + (own?.[key] ?? 0);
    combined.ultimateShieldDurationMs = Math.max(
      bonuses.ultimateShieldDurationMs,
      own?.ultimateShieldDurationMs ?? 0,
    );
    combined.stunBonusMs = Math.min(2000, combined.stunBonusMs);
    const b = combined;
    return {
      ...hero,
      ...b,
      attack: Math.max(1, Math.round(hero.attack * (1 + b.teamDamageRatio))),
      passiveDamageReductionRatio:
        1 -
        (1 - b.teamDamageReductionRatio) *
          (1 - Math.min(0.8, b.personalReductionRatio ?? 0)),
      ultimate:
        hero.ultimate.type === 'team_shield'
          ? {
              ...hero.ultimate,
              shieldAmount: Math.round(
                hero.ultimate.shieldAmount * (1 + (b.shieldPowerRatio ?? 0)),
              ),
            }
          : hero.ultimate,
      attackIntervalMs: Math.max(
        100,
        Math.round(hero.attackIntervalMs / (1 + b.attackSpeedRatio)),
      ),
      energyOnAttackHit: Math.max(
        1,
        Math.round(hero.energyOnAttackHit * (1 + b.energyGainRatio)),
      ),
      energyOnDamageTaken: Math.max(
        1,
        Math.round(hero.energyOnDamageTaken * (1 + b.energyGainRatio)),
      ),
    };
  });
}
