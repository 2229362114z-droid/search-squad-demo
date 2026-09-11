import type {
  CharacterConfig,
  CombatRulesConfig,
  EnemiesConfig,
  EnemyConfig,
  EnemyNature,
} from '@/src/config/types';
import {
  randomInteger,
  seedToRandomState,
  weightedIndex,
} from '@/src/domain/combat/random';
import type {
  EnemyCombatantInput,
  HeroCombatantInput,
} from '@/src/domain/combat/types';

export type CombatRoomKind = 'combat' | 'elite' | 'boss';

export interface GeneratedEncounter {
  readonly enemies: readonly EnemyCombatantInput[];
  readonly randomState: number;
  readonly danger: number;
}

function pickEnemy(
  state: number,
  candidates: readonly EnemyConfig[],
): { readonly state: number; readonly enemy: EnemyConfig } {
  if (candidates.length === 0) {
    throw new Error('遭遇配置没有可用的敌人');
  }
  const picked = weightedIndex(
    state,
    candidates.map((enemy) => enemy.spawnWeight),
  );
  const enemy = candidates[picked.index];
  if (!enemy) throw new Error('遭遇敌人选择越界');
  return { state: picked.state, enemy };
}

export function createHeroCombatants(
  characters: readonly CharacterConfig[],
  healthByCharacterId: Readonly<Record<string, number | undefined>> = {},
  energyByCharacterId: Readonly<Record<string, number | undefined>> = {},
): readonly HeroCombatantInput[] {
  return characters.map((character, slot) => ({
    instanceId: `hero:${character.id}`,
    configId: character.id,
    displayName: character.displayName,
    side: 'hero',
    maxHealth: character.maxHealth,
    health: Math.min(
      character.maxHealth,
      Math.max(0, healthByCharacterId[character.id] ?? character.maxHealth),
    ),
    attack: character.attack,
    attackIntervalMs: character.attackIntervalMs,
    aggroWeight: character.baseAggro,
    energy: Math.max(0, energyByCharacterId[character.id] ?? 0),
    energyOnAttackHit: character.energyOnAttackHit,
    energyOnDamageTaken: character.energyOnDamageTaken,
    ultimate: character.ultimate,
    slot,
  }));
}

/** Expected whole-room budget, including mandatory enemy and all escorts. */
function referenceBudget(
  kind: CombatRoomKind,
  danger: number,
  rules: CombatRulesConfig,
  definitions: EnemiesConfig,
  nature: EnemyNature,
) {
  const rule = rules.encounterRules[kind];
  const average = (pool: readonly EnemyConfig[]) => {
    const weight = pool.reduce((sum, enemy) => sum + enemy.spawnWeight, 0);
    if (weight <= 0) throw new Error('遭遇预算没有可用的敌人');
    return {
      health:
        pool.reduce((sum, e) => sum + e.maxHealth * e.spawnWeight, 0) / weight,
      dps:
        pool.reduce(
          (sum, e) =>
            sum + (e.attack / e.attackIntervalMs) * 1000 * e.spawnWeight,
          0,
        ) / weight,
    };
  };
  const pool = definitions.enemies.filter((e) => e.nature === nature);
  const escorts = average(
    pool.filter((e) => rule.allowedTiers.includes(e.tier)),
  );
  const core = rule.requiredTier
    ? average(pool.filter((e) => e.tier === rule.requiredTier))
    : { health: 0, dps: 0 };
  const escortCount =
    (rule.minimumUnits + rule.maximumUnits) / 2 - (rule.requiredTier ? 1 : 0);
  const offset = danger - rules.dangerScaling.minimumDanger;
  return {
    health:
      (core.health + escorts.health * escortCount) *
      rule.healthMultiplier *
      (1 + offset * rules.dangerScaling.healthPerLevel),
    dps:
      (core.dps + escorts.dps * escortCount) *
      rule.damageMultiplier *
      (1 + offset * rules.dangerScaling.damagePerLevel),
  };
}

export function generateEncounter(
  seed: string | number,
  kind: CombatRoomKind,
  danger: number,
  combatRules: CombatRulesConfig,
  enemiesConfig: EnemiesConfig,
  nature: EnemyNature = 'physical',
): GeneratedEncounter {
  const rule = combatRules.encounterRules[kind];
  const boundedDanger = Math.min(
    combatRules.dangerScaling.maximumDanger,
    Math.max(combatRules.dangerScaling.minimumDanger, Math.round(danger)),
  );
  let randomState = seedToRandomState(
    `${seed}:encounter:${kind}:${boundedDanger}`,
  );
  const countResult = randomInteger(
    randomState,
    rule.minimumUnits,
    rule.maximumUnits,
  );
  randomState = countResult.state;

  const selected: EnemyConfig[] = [];
  if (rule.requiredTier) {
    const required = enemiesConfig.enemies.filter(
      (enemy) => enemy.tier === rule.requiredTier && enemy.nature === nature,
    );
    const picked = pickEnemy(randomState, required);
    randomState = picked.state;
    selected.push(picked.enemy);
  }

  const allowed = enemiesConfig.enemies.filter(
    (enemy) =>
      rule.allowedTiers.includes(enemy.tier) && enemy.nature === nature,
  );
  while (selected.length < countResult.value) {
    const picked = pickEnemy(randomState, allowed);
    randomState = picked.state;
    selected.push(picked.enemy);
  }

  const levelOffset = boundedDanger - combatRules.dangerScaling.minimumDanger;
  let healthMultiplier =
    (1 + levelOffset * combatRules.dangerScaling.healthPerLevel) *
    rule.healthMultiplier;
  let damageMultiplier =
    (1 + levelOffset * combatRules.dangerScaling.damagePerLevel) *
    rule.damageMultiplier;

  if (kind !== 'boss') {
    const { minimumDanger, maximumDanger } = combatRules.dangerScaling;
    const near = referenceBudget(
      kind,
      minimumDanger,
      combatRules,
      enemiesConfig,
      nature,
    );
    const boss = referenceBudget(
      'boss',
      maximumDanger,
      combatRules,
      enemiesConfig,
      nature,
    );
    const curve = combatRules.nonBossProgression[kind];
    const t =
      maximumDanger === minimumDanger
        ? 0
        : (boundedDanger - minimumDanger) / (maximumDanger - minimumDanger);
    const blend = t * t * (3 - 2 * t);
    const healthBudget =
      near.health + (boss.health * curve.farHealthRatio - near.health) * blend;
    const dpsBudget =
      near.dps + (boss.dps * curve.farDamagePerSecondRatio - near.dps) * blend;
    healthMultiplier =
      healthBudget / selected.reduce((sum, e) => sum + e.maxHealth, 0);
    damageMultiplier =
      dpsBudget /
      selected.reduce(
        (sum, e) => sum + (e.attack / e.attackIntervalMs) * 1000,
        0,
      );
  }

  const kindScale = combatRules.difficultyScale[kind];
  healthMultiplier *= kindScale;
  damageMultiplier *= kindScale;

  return {
    randomState,
    danger: boundedDanger,
    enemies: selected.map((enemy, slot) => {
      const maxHealth = Math.max(
        1,
        Math.round(enemy.maxHealth * healthMultiplier),
      );
      return {
        instanceId: `enemy:${slot}:${enemy.id}`,
        configId: enemy.id,
        displayName: enemy.displayName,
        side: 'enemy' as const,
        nature,
        tier: enemy.tier,
        maxHealth,
        health: maxHealth,
        attack: Math.max(1, Math.round(enemy.attack * damageMultiplier)),
        attackIntervalMs: enemy.attackIntervalMs,
        baseThreat: enemy.baseThreat,
        frontlineOrder: enemy.frontlineOrder,
        slot,
      };
    }),
  };
}
