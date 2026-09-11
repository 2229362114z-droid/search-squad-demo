import type { CombatRulesConfig } from '@/src/config/types';
import { nextRandom, seedToRandomState } from '@/src/domain/combat/random';
import type {
  CombatAdvanceResult,
  CombatEvent,
  CombatSimulationResult,
  CombatState,
  CombatUnitState,
  CombatantInput,
  HeroCombatPersistence,
  UltimateReleaseRejection,
  UltimateReleaseResult,
} from '@/src/domain/combat/types';

function isAlive(unit: CombatUnitState): boolean {
  return unit.health > 0;
}

function stableActionOrder(
  left: CombatUnitState,
  right: CombatUnitState,
): number {
  if (left.side !== right.side) return left.side === 'hero' ? -1 : 1;
  return (
    left.slot - right.slot || left.instanceId.localeCompare(right.instanceId)
  );
}

function statusFor(units: readonly CombatUnitState[]): CombatState['status'] {
  if (!units.some((unit) => unit.side === 'enemy' && isAlive(unit))) {
    return 'victory';
  }
  if (!units.some((unit) => unit.side === 'hero' && isAlive(unit))) {
    return 'defeat';
  }
  return 'running';
}

function toUnit(
  input: CombatantInput,
  combatRules: CombatRulesConfig,
): CombatUnitState {
  return {
    instanceId: input.instanceId,
    nature: input.side === 'enemy' ? (input.nature ?? 'physical') : null,
    basicDamageRatio: input.side === 'hero' ? (input.basicDamageRatio ?? 0) : 0,
    lifestealRatio: input.side === 'hero' ? (input.lifestealRatio ?? 0) : 0,
    ultimateDamageRatio:
      input.side === 'hero' ? (input.ultimateDamageRatio ?? 0) : 0,
    ultimateShield: input.side === 'hero' ? (input.ultimateShield ?? 0) : 0,
    ultimateShieldDurationMs:
      input.side === 'hero' ? (input.ultimateShieldDurationMs ?? 0) : 0,
    stunBonusMs:
      input.side === 'hero' ? Math.min(2000, input.stunBonusMs ?? 0) : 0,
    configId: input.configId,
    displayName: input.displayName,
    side: input.side,
    maxHealth: input.maxHealth,
    health: Math.min(
      input.maxHealth,
      Math.max(0, input.health ?? input.maxHealth),
    ),
    attack: input.attack,
    attackIntervalMs: input.attackIntervalMs,
    attackCooldownMs: input.attackIntervalMs,
    slot: input.slot,
    aggroWeight: input.side === 'hero' ? input.aggroWeight : 0,
    tier: input.side === 'enemy' ? input.tier : null,
    baseThreat: input.side === 'enemy' ? input.baseThreat : 0,
    frontlineOrder: input.side === 'enemy' ? input.frontlineOrder : 0,
    castingWarning: false,
    energy:
      input.side === 'hero'
        ? Math.min(combatRules.maximumEnergy, Math.max(0, input.energy ?? 0))
        : 0,
    energyOnAttackHit: input.side === 'hero' ? input.energyOnAttackHit : 0,
    energyOnDamageTaken: input.side === 'hero' ? input.energyOnDamageTaken : 0,
    ultimate: input.side === 'hero' ? input.ultimate : null,
    aggroMultiplier: 1,
    damageReductionRatio:
      input.side === 'hero'
        ? Math.min(0.9, Math.max(0, input.passiveDamageReductionRatio ?? 0))
        : 0,
    passiveDamageReductionRatio:
      input.side === 'hero'
        ? Math.min(0.9, Math.max(0, input.passiveDamageReductionRatio ?? 0))
        : 0,
    damageBonusByEnemyTier:
      input.side === 'hero' ? (input.damageBonusByEnemyTier ?? {}) : {},
    openingDamageRatio:
      input.side === 'hero' ? Math.max(0, input.openingDamageRatio ?? 0) : 0,
    openingDamageUntilMs:
      input.side === 'hero'
        ? Math.max(0, input.openingDamageDurationMs ?? 0)
        : 0,
    tauntUntilMs: 0,
    shield: 0,
    shieldUntilMs: 0,
    stunnedUntilMs: 0,
  };
}

function assertCombatants(
  combatants: readonly CombatantInput[],
  combatRules: CombatRulesConfig,
): void {
  const ids = new Set<string>();
  for (const combatant of combatants) {
    if (ids.has(combatant.instanceId)) {
      throw new Error(`战斗单位实例 ID 重复：${combatant.instanceId}`);
    }
    ids.add(combatant.instanceId);
    if (combatant.maxHealth <= 0 || combatant.attack <= 0) {
      throw new Error(`战斗单位属性无效：${combatant.instanceId}`);
    }
    if (combatant.attackIntervalMs < combatRules.fixedStepMs) {
      throw new Error(`战斗单位攻击间隔小于固定步长：${combatant.instanceId}`);
    }
  }
  if (!combatants.some((combatant) => combatant.side === 'hero')) {
    throw new Error('战斗至少需要一名英雄');
  }
  if (!combatants.some((combatant) => combatant.side === 'enemy')) {
    throw new Error('战斗至少需要一名敌人');
  }
}

export function createCombatState(
  seed: string | number,
  combatRules: CombatRulesConfig,
  combatants: readonly CombatantInput[],
): CombatState {
  assertCombatants(combatants, combatRules);
  const units = combatants
    .map((combatant) => toUnit(combatant, combatRules))
    .sort(stableActionOrder);
  return {
    seed,
    randomState: seedToRandomState(`${seed}:combat`),
    tick: 0,
    elapsedMs: 0,
    accumulatorMs: 0,
    status: statusFor(units),
    units,
  };
}

export function selectWeightedAggroTarget(
  candidates: readonly CombatUnitState[],
  randomValue: number,
): CombatUnitState | undefined {
  const living = candidates
    .filter((unit) => unit.side === 'hero' && isAlive(unit))
    .sort(
      (left, right) =>
        left.slot - right.slot ||
        left.instanceId.localeCompare(right.instanceId),
    );
  if (living.length === 0) return undefined;
  const taunting = living.filter((unit) => unit.tauntUntilMs > 0);
  const eligible = taunting.length > 0 ? taunting : living;
  const total = eligible.reduce(
    (sum, unit) => sum + Math.max(0, unit.aggroWeight * unit.aggroMultiplier),
    0,
  );
  if (total <= 0) return eligible[0];

  const normalized = Math.min(0.999999999999, Math.max(0, randomValue));
  const threshold = normalized * total;
  let accumulated = 0;
  for (const unit of eligible) {
    accumulated += Math.max(0, unit.aggroWeight * unit.aggroMultiplier);
    if (threshold < accumulated) return unit;
  }
  return eligible[eligible.length - 1];
}

function selectFrontEnemy(
  units: readonly CombatUnitState[],
): CombatUnitState | undefined {
  return units
    .filter((unit) => unit.side === 'enemy' && isAlive(unit))
    .sort(
      (left, right) =>
        left.frontlineOrder - right.frontlineOrder ||
        left.slot - right.slot ||
        left.instanceId.localeCompare(right.instanceId),
    )[0];
}

export function selectHighestThreatEnemy(
  units: readonly CombatUnitState[],
  combatRules: CombatRulesConfig,
): CombatUnitState | undefined {
  function threat(unit: CombatUnitState): number {
    return (
      unit.baseThreat +
      (unit.castingWarning
        ? combatRules.threatModifiers.castingWarningBonus
        : 0) +
      (unit.tier === 'elite' ? combatRules.threatModifiers.eliteBonus : 0) +
      (unit.tier === 'boss' ? combatRules.threatModifiers.bossBonus : 0)
    );
  }

  return units
    .filter((unit) => unit.side === 'enemy' && isAlive(unit))
    .sort(
      (left, right) =>
        threat(right) - threat(left) ||
        left.health / left.maxHealth - right.health / right.maxHealth ||
        left.slot - right.slot ||
        left.instanceId.localeCompare(right.instanceId),
    )[0];
}

export function setEnemyCastingWarning(
  state: CombatState,
  instanceId: string,
  castingWarning: boolean,
): CombatState {
  return {
    ...state,
    units: state.units.map((unit) =>
      unit.instanceId === instanceId && unit.side === 'enemy'
        ? { ...unit, castingWarning }
        : unit,
    ),
  };
}

export function extractHeroCombatPersistence(
  state: CombatState,
): Readonly<Record<string, HeroCombatPersistence>> {
  return Object.fromEntries(
    state.units
      .filter((unit) => unit.side === 'hero')
      .map((unit) => [
        unit.configId,
        { health: unit.health, energy: unit.energy },
      ]),
  );
}

interface DamageResult {
  readonly units: readonly CombatUnitState[];
  readonly rawDamage: number;
  readonly damage: number;
  readonly shieldAbsorbed: number;
  readonly targetHealthAfter: number;
  readonly defeated: boolean;
}

function applyDamage(
  units: readonly CombatUnitState[],
  targetId: string,
  rawDamage: number,
  combatRules: CombatRulesConfig,
): DamageResult {
  const target = units.find((unit) => unit.instanceId === targetId);
  if (!target || !isAlive(target)) {
    throw new Error(`伤害目标不存在或已经倒地：${targetId}`);
  }
  const mitigatedDamage = Math.max(
    combatRules.minimumDamage,
    Math.round(rawDamage * (1 - target.damageReductionRatio)),
  );
  const shieldAbsorbed = Math.min(target.shield, mitigatedDamage);
  const damage = mitigatedDamage - shieldAbsorbed;
  const targetHealthAfter = Math.max(0, target.health - damage);

  return {
    units: units.map((unit) =>
      unit.instanceId === targetId
        ? {
            ...unit,
            health: targetHealthAfter,
            shield: unit.shield - shieldAbsorbed,
          }
        : unit,
    ),
    rawDamage,
    damage,
    shieldAbsorbed,
    targetHealthAfter,
    defeated: targetHealthAfter === 0,
  };
}

function gainEnergy(
  units: readonly CombatUnitState[],
  unitId: string,
  requestedAmount: number,
  combatRules: CombatRulesConfig,
): {
  readonly units: readonly CombatUnitState[];
  readonly amount: number;
  readonly energyAfter: number;
} {
  const unit = units.find((candidate) => candidate.instanceId === unitId);
  if (!unit || unit.side !== 'hero' || !isAlive(unit)) {
    return { units, amount: 0, energyAfter: unit?.energy ?? 0 };
  }
  const energyAfter = Math.min(
    combatRules.maximumEnergy,
    unit.energy + requestedAmount,
  );
  const amount = energyAfter - unit.energy;
  return {
    units:
      amount > 0
        ? units.map((candidate) =>
            candidate.instanceId === unitId
              ? { ...candidate, energy: energyAfter }
              : candidate,
          )
        : units,
    amount,
    energyAfter,
  };
}

function outgoingDamageMultiplier(
  attacker: CombatUnitState,
  target: CombatUnitState,
  atMs: number,
): number {
  const tierRatio = target.tier
    ? (attacker.damageBonusByEnemyTier[target.tier] ?? 0)
    : 0;
  const openingRatio =
    attacker.openingDamageUntilMs > atMs ? attacker.openingDamageRatio : 0;
  return 1 + tierRatio + openingRatio;
}

function expireTimedEffects(
  unit: CombatUnitState,
  elapsedMs: number,
): CombatUnitState {
  let next = unit;
  if (next.tauntUntilMs > 0 && next.tauntUntilMs <= elapsedMs) {
    next = {
      ...next,
      aggroMultiplier: 1,
      damageReductionRatio: next.passiveDamageReductionRatio,
      tauntUntilMs: 0,
    };
  }
  if (next.shieldUntilMs > 0 && next.shieldUntilMs <= elapsedMs) {
    next = { ...next, shield: 0, shieldUntilMs: 0 };
  }
  if (next.stunnedUntilMs > 0 && next.stunnedUntilMs <= elapsedMs) {
    next = { ...next, stunnedUntilMs: 0 };
  }
  return next;
}

function fixedStep(
  state: CombatState,
  combatRules: CombatRulesConfig,
): { readonly state: CombatState; readonly events: readonly CombatEvent[] } {
  if (state.status !== 'running') return { state, events: [] };

  const tick = state.tick + 1;
  const elapsedMs = state.elapsedMs + combatRules.fixedStepMs;
  let randomState = state.randomState;
  let units: readonly CombatUnitState[] = state.units.map((unit) => {
    const activeUnit = expireTimedEffects(unit, elapsedMs);
    return isAlive(activeUnit)
      ? {
          ...activeUnit,
          attackCooldownMs:
            activeUnit.attackCooldownMs - combatRules.fixedStepMs,
        }
      : activeUnit;
  });
  const readyIds = units
    .filter(
      (unit) =>
        isAlive(unit) &&
        unit.attackCooldownMs <= 0 &&
        unit.stunnedUntilMs === 0,
    )
    .sort(stableActionOrder)
    .map((unit) => unit.instanceId);
  const events: CombatEvent[] = [];

  for (const attackerId of readyIds) {
    const attacker = units.find((unit) => unit.instanceId === attackerId);
    if (!attacker || !isAlive(attacker)) continue;

    let target: CombatUnitState | undefined;
    if (attacker.side === 'hero') {
      target = selectFrontEnemy(units);
    } else {
      const targetRoll = nextRandom(randomState);
      randomState = targetRoll.state;
      target = selectWeightedAggroTarget(units, targetRoll.value);
    }
    if (!target) break;

    const varianceRoll = nextRandom(randomState);
    randomState = varianceRoll.state;
    const variance =
      1 + (varianceRoll.value * 2 - 1) * combatRules.damageVarianceRatio;
    const criticalRoll = nextRandom(randomState);
    randomState = criticalRoll.state;
    const critical = criticalRoll.value < combatRules.criticalChance;
    const rawDamage = Math.max(
      combatRules.minimumDamage,
      Math.round(
        attacker.attack *
          (1 + attacker.basicDamageRatio) *
          outgoingDamageMultiplier(attacker, target, elapsedMs) *
          variance *
          (critical ? combatRules.criticalMultiplier : 1),
      ),
    );
    const damageResult = applyDamage(
      units,
      target.instanceId,
      rawDamage,
      combatRules,
    );
    units = damageResult.units.map((unit) =>
      unit.instanceId === attackerId
        ? {
            ...unit,
            attackCooldownMs: unit.attackCooldownMs + unit.attackIntervalMs,
          }
        : unit,
    );
    events.push({
      type: 'attack',
      tick,
      atMs: elapsedMs,
      attackerId,
      targetId: target.instanceId,
      damage: damageResult.damage,
      rawDamage: damageResult.rawDamage,
      shieldAbsorbed: damageResult.shieldAbsorbed,
      critical,
      targetHealthAfter: damageResult.targetHealthAfter,
    });

    if (attacker.side === 'hero') {
      const healing = Math.min(
        attacker.maxHealth - attacker.health,
        Math.min(target.health, damageResult.damage) * attacker.lifestealRatio,
      );
      if (healing > 0) {
        units = units.map((unit) =>
          unit.instanceId === attackerId
            ? {
                ...unit,
                health: Math.min(unit.maxHealth, unit.health + healing),
              }
            : unit,
        );
        events.push({
          type: 'lifesteal',
          tick,
          atMs: elapsedMs,
          unitId: attackerId,
          amount: healing,
        });
      }
      const charged = gainEnergy(
        units,
        attackerId,
        attacker.energyOnAttackHit,
        combatRules,
      );
      units = charged.units;
      if (charged.amount > 0) {
        events.push({
          type: 'energy-gained',
          tick,
          atMs: elapsedMs,
          unitId: attackerId,
          source: 'attack-hit',
          amount: charged.amount,
          energyAfter: charged.energyAfter,
        });
      }
    }
    if (
      target.side === 'hero' &&
      damageResult.targetHealthAfter > 0 &&
      damageResult.damage > 0
    ) {
      const charged = gainEnergy(
        units,
        target.instanceId,
        target.energyOnDamageTaken,
        combatRules,
      );
      units = charged.units;
      if (charged.amount > 0) {
        events.push({
          type: 'energy-gained',
          tick,
          atMs: elapsedMs,
          unitId: target.instanceId,
          source: 'damage-taken',
          amount: charged.amount,
          energyAfter: charged.energyAfter,
        });
      }
    }
    if (damageResult.defeated) {
      events.push({
        type: 'unit-defeated',
        tick,
        atMs: elapsedMs,
        unitId: target.instanceId,
      });
    }

    const status = statusFor(units);
    if (status !== 'running') {
      events.push({
        type: 'combat-ended',
        tick,
        atMs: elapsedMs,
        result: status,
      });
      return {
        state: {
          ...state,
          randomState,
          tick,
          elapsedMs,
          status,
          units,
        },
        events,
      };
    }
  }

  return {
    state: {
      ...state,
      randomState,
      tick,
      elapsedMs,
      units,
    },
    events,
  };
}

function rejectUltimate(
  state: CombatState,
  rejection: UltimateReleaseRejection,
): UltimateReleaseResult {
  return { accepted: false, rejection, state, events: [] };
}

export function releaseUltimate(
  state: CombatState,
  combatRules: CombatRulesConfig,
  heroInstanceId: string,
): UltimateReleaseResult {
  if (state.status !== 'running') return rejectUltimate(state, 'combat-ended');
  const hero = state.units.find(
    (unit) => unit.instanceId === heroInstanceId && unit.side === 'hero',
  );
  if (!hero) return rejectUltimate(state, 'hero-not-found');
  if (!isAlive(hero)) return rejectUltimate(state, 'hero-downed');
  if (!hero.ultimate) return rejectUltimate(state, 'ultimate-not-configured');
  if (hero.energy < combatRules.maximumEnergy) {
    return rejectUltimate(state, 'energy-not-full');
  }

  const tick = state.tick;
  const atMs = state.elapsedMs;
  const ultimate = hero.ultimate;
  let units: readonly CombatUnitState[] = state.units.map((unit) =>
    unit.instanceId === heroInstanceId ? { ...unit, energy: 0 } : unit,
  );
  const events: CombatEvent[] = [
    {
      type: 'ultimate-released',
      tick,
      atMs,
      unitId: heroInstanceId,
      ultimateType: ultimate.type,
    },
  ];

  const dealUltimateDamage = (targetId: string, baseDamage: number): void => {
    const target = units.find((unit) => unit.instanceId === targetId);
    if (!target) return;
    const rawDamage = Math.max(
      combatRules.minimumDamage,
      Math.round(
        baseDamage *
          outgoingDamageMultiplier(hero, target, atMs) *
          (1 + hero.ultimateDamageRatio),
      ),
    );
    const result = applyDamage(units, targetId, rawDamage, combatRules);
    units = result.units;
    events.push({
      type: 'ultimate-damage',
      tick,
      atMs,
      attackerId: heroInstanceId,
      targetId,
      damage: result.damage,
      rawDamage: result.rawDamage,
      shieldAbsorbed: result.shieldAbsorbed,
      targetHealthAfter: result.targetHealthAfter,
    });
    if (result.defeated) {
      events.push({ type: 'unit-defeated', tick, atMs, unitId: targetId });
    }
  };

  switch (ultimate.type) {
    case 'highest_threat_barrage': {
      const target = selectHighestThreatEnemy(units, combatRules);
      if (target) {
        const rawDamage = Math.max(
          combatRules.minimumDamage,
          Math.round(hero.attack * ultimate.damageRatioPerHit),
        );
        for (let hit = 0; hit < ultimate.hitCount; hit += 1) {
          const currentTarget = units.find(
            (unit) => unit.instanceId === target.instanceId,
          );
          if (!currentTarget || !isAlive(currentTarget)) break;
          dealUltimateDamage(target.instanceId, rawDamage);
        }
      }
      break;
    }
    case 'taunt_and_reduce_damage': {
      const expiresAtMs = atMs + ultimate.durationMs;
      units = units.map((unit) =>
        unit.instanceId === heroInstanceId
          ? {
              ...unit,
              aggroMultiplier: ultimate.aggroMultiplier,
              damageReductionRatio: Math.min(
                0.9,
                1 -
                  (1 - unit.passiveDamageReductionRatio) *
                    (1 - ultimate.damageReductionRatio),
              ),
              tauntUntilMs: expiresAtMs,
            }
          : unit,
      );
      events.push(
        {
          type: 'status-applied',
          tick,
          atMs,
          sourceId: heroInstanceId,
          targetId: heroInstanceId,
          status: 'taunt',
          expiresAtMs,
        },
        {
          type: 'status-applied',
          tick,
          atMs,
          sourceId: heroInstanceId,
          targetId: heroInstanceId,
          status: 'damage-reduction',
          expiresAtMs,
        },
      );
      break;
    }
    case 'all_enemy_damage_and_stun': {
      const targetIds = units
        .filter((unit) => unit.side === 'enemy' && isAlive(unit))
        .sort(stableActionOrder)
        .map((unit) => unit.instanceId);
      const rawDamage = Math.max(
        combatRules.minimumDamage,
        Math.round(hero.attack * ultimate.damageRatio),
      );
      for (const targetId of targetIds) {
        dealUltimateDamage(targetId, rawDamage);
      }
      const expiresAtMs = atMs + ultimate.stunDurationMs + hero.stunBonusMs;
      units = units.map((unit) =>
        unit.side === 'enemy' && isAlive(unit)
          ? {
              ...unit,
              stunnedUntilMs: Math.max(unit.stunnedUntilMs, expiresAtMs),
            }
          : unit,
      );
      for (const targetId of targetIds) {
        if (
          !units.some((unit) => unit.instanceId === targetId && isAlive(unit))
        ) {
          continue;
        }
        events.push({
          type: 'status-applied',
          tick,
          atMs,
          sourceId: heroInstanceId,
          targetId,
          status: 'stun',
          expiresAtMs,
        });
      }
      break;
    }
    case 'team_shield': {
      const expiresAtMs = atMs + ultimate.durationMs;
      const targetIds = units
        .filter((unit) => unit.side === 'hero' && isAlive(unit))
        .map((unit) => unit.instanceId);
      units = units.map((unit) =>
        targetIds.includes(unit.instanceId)
          ? {
              ...unit,
              shield: Math.max(unit.shield, ultimate.shieldAmount),
              shieldUntilMs: Math.max(unit.shieldUntilMs, expiresAtMs),
            }
          : unit,
      );
      for (const targetId of targetIds) {
        events.push({
          type: 'shield-applied',
          tick,
          atMs,
          sourceId: heroInstanceId,
          targetId,
          amount: ultimate.shieldAmount,
          expiresAtMs,
        });
      }
      break;
    }
  }

  if (hero.ultimateShield > 0) {
    const expiresAtMs = atMs + hero.ultimateShieldDurationMs;
    units = units.map((unit) =>
      unit.instanceId === heroInstanceId
        ? {
            ...unit,
            shield: Math.max(unit.shield, hero.ultimateShield),
            shieldUntilMs: Math.max(unit.shieldUntilMs, expiresAtMs),
          }
        : unit,
    );
    events.push({
      type: 'shield-applied',
      tick,
      atMs,
      sourceId: heroInstanceId,
      targetId: heroInstanceId,
      amount: hero.ultimateShield,
      expiresAtMs,
    });
  }
  const status = statusFor(units);
  if (status !== 'running') {
    events.push({ type: 'combat-ended', tick, atMs, result: status });
  }
  return {
    accepted: true,
    state: { ...state, status, units },
    events,
  };
}

export function stepCombat(
  state: CombatState,
  combatRules: CombatRulesConfig,
): CombatAdvanceResult {
  const result = fixedStep(state, combatRules);
  return {
    state: { ...result.state, accumulatorMs: state.accumulatorMs },
    events: result.events,
    processedSteps: state.status === 'running' ? 1 : 0,
    discardedMs: 0,
  };
}

export function advanceCombat(
  state: CombatState,
  combatRules: CombatRulesConfig,
  deltaMs: number,
): CombatAdvanceResult {
  if (state.status !== 'running' || deltaMs <= 0) {
    return { state, events: [], processedSteps: 0, discardedMs: 0 };
  }

  const requestedTotal = state.accumulatorMs + deltaMs;
  const maximumProcessable =
    combatRules.fixedStepMs * combatRules.maxCatchUpSteps;
  const retainedTotal = Math.min(requestedTotal, maximumProcessable);
  const discardedMs = Math.max(0, requestedTotal - retainedTotal);
  const stepCount = Math.floor(retainedTotal / combatRules.fixedStepMs);
  let nextState: CombatState = {
    ...state,
    accumulatorMs: retainedTotal - stepCount * combatRules.fixedStepMs,
  };
  const events: CombatEvent[] = [];
  let processedSteps = 0;

  for (let index = 0; index < stepCount; index += 1) {
    if (nextState.status !== 'running') break;
    const result = fixedStep(nextState, combatRules);
    nextState = {
      ...result.state,
      accumulatorMs: nextState.accumulatorMs,
    };
    events.push(...result.events);
    processedSteps += 1;
  }

  return { state: nextState, events, processedSteps, discardedMs };
}

export function simulateCombat(
  initialState: CombatState,
  combatRules: CombatRulesConfig,
  timeoutMs = combatRules.simulationTimeoutMs,
): CombatSimulationResult {
  let state = initialState;
  const events: CombatEvent[] = [];
  const maximumSteps = Math.ceil(timeoutMs / combatRules.fixedStepMs);

  for (let index = 0; index < maximumSteps; index += 1) {
    if (state.status !== 'running') break;
    const result = stepCombat(state, combatRules);
    state = result.state;
    events.push(...result.events);
  }

  return {
    state,
    events,
    timedOut: state.status === 'running',
  };
}
