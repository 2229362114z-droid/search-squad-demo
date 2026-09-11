import type {
  CharacterUltimateConfig,
  EnemyTier,
  EnemyNature,
} from '@/src/config/types';

interface BaseCombatantInput {
  readonly instanceId: string;
  readonly configId: string;
  readonly displayName: string;
  readonly maxHealth: number;
  readonly health?: number;
  readonly attack: number;
  readonly attackIntervalMs: number;
  readonly slot: number;
}

export interface HeroCombatantInput extends BaseCombatantInput {
  readonly basicDamageRatio?: number;
  readonly lifestealRatio?: number;
  readonly ultimateDamageRatio?: number;
  readonly ultimateShield?: number;
  readonly ultimateShieldDurationMs?: number;
  readonly stunBonusMs?: number;
  readonly side: 'hero';
  readonly aggroWeight: number;
  readonly energy?: number;
  readonly energyOnAttackHit: number;
  readonly energyOnDamageTaken: number;
  readonly ultimate: CharacterUltimateConfig;
  readonly passiveDamageReductionRatio?: number;
  readonly damageBonusByEnemyTier?: Readonly<
    Partial<Record<EnemyTier, number>>
  >;
  readonly openingDamageRatio?: number;
  readonly openingDamageDurationMs?: number;
}

export interface EnemyCombatantInput extends BaseCombatantInput {
  readonly nature?: EnemyNature;
  readonly side: 'enemy';
  readonly tier: EnemyTier;
  readonly baseThreat: number;
  readonly frontlineOrder: number;
}

export type CombatantInput = HeroCombatantInput | EnemyCombatantInput;
export type CombatStatus = 'running' | 'victory' | 'defeat';

export interface CombatUnitState {
  readonly nature: EnemyNature | null;
  readonly basicDamageRatio: number;
  readonly lifestealRatio: number;
  readonly ultimateDamageRatio: number;
  readonly ultimateShield: number;
  readonly ultimateShieldDurationMs: number;
  readonly stunBonusMs: number;
  readonly instanceId: string;
  readonly configId: string;
  readonly displayName: string;
  readonly side: 'hero' | 'enemy';
  readonly maxHealth: number;
  readonly health: number;
  readonly attack: number;
  readonly attackIntervalMs: number;
  readonly attackCooldownMs: number;
  readonly slot: number;
  readonly aggroWeight: number;
  readonly tier: EnemyTier | null;
  readonly baseThreat: number;
  readonly frontlineOrder: number;
  readonly castingWarning: boolean;
  readonly energy: number;
  readonly energyOnAttackHit: number;
  readonly energyOnDamageTaken: number;
  readonly ultimate: CharacterUltimateConfig | null;
  readonly aggroMultiplier: number;
  readonly damageReductionRatio: number;
  readonly passiveDamageReductionRatio: number;
  readonly damageBonusByEnemyTier: Readonly<Partial<Record<EnemyTier, number>>>;
  readonly openingDamageRatio: number;
  readonly openingDamageUntilMs: number;
  readonly tauntUntilMs: number;
  readonly shield: number;
  readonly shieldUntilMs: number;
  readonly stunnedUntilMs: number;
}

export interface CombatState {
  readonly seed: string | number;
  readonly randomState: number;
  readonly tick: number;
  readonly elapsedMs: number;
  readonly accumulatorMs: number;
  readonly status: CombatStatus;
  readonly units: readonly CombatUnitState[];
}

interface CombatEventBase {
  readonly tick: number;
  readonly atMs: number;
}

export interface CombatAttackEvent extends CombatEventBase {
  readonly type: 'attack';
  readonly attackerId: string;
  readonly targetId: string;
  readonly damage: number;
  readonly rawDamage: number;
  readonly shieldAbsorbed: number;
  readonly critical: boolean;
  readonly targetHealthAfter: number;
}

export interface CombatEnergyGainedEvent extends CombatEventBase {
  readonly type: 'energy-gained';
  readonly unitId: string;
  readonly source: 'attack-hit' | 'damage-taken';
  readonly amount: number;
  readonly energyAfter: number;
}

export interface CombatUltimateReleasedEvent extends CombatEventBase {
  readonly type: 'ultimate-released';
  readonly unitId: string;
  readonly ultimateType: CharacterUltimateConfig['type'];
}

export interface CombatUltimateDamageEvent extends CombatEventBase {
  readonly type: 'ultimate-damage';
  readonly attackerId: string;
  readonly targetId: string;
  readonly damage: number;
  readonly rawDamage: number;
  readonly shieldAbsorbed: number;
  readonly targetHealthAfter: number;
}

export interface CombatStatusAppliedEvent extends CombatEventBase {
  readonly type: 'status-applied';
  readonly sourceId: string;
  readonly targetId: string;
  readonly status: 'taunt' | 'damage-reduction' | 'stun';
  readonly expiresAtMs: number;
}

export interface CombatShieldAppliedEvent extends CombatEventBase {
  readonly type: 'shield-applied';
  readonly sourceId: string;
  readonly targetId: string;
  readonly amount: number;
  readonly expiresAtMs: number;
}

export interface CombatUnitDefeatedEvent extends CombatEventBase {
  readonly type: 'unit-defeated';
  readonly unitId: string;
}

export interface CombatEndedEvent extends CombatEventBase {
  readonly type: 'combat-ended';
  readonly result: Extract<CombatStatus, 'victory' | 'defeat'>;
}

export type CombatEvent =
  | (CombatEventBase & {
      readonly type: 'lifesteal';
      readonly unitId: string;
      readonly amount: number;
    })
  | CombatAttackEvent
  | CombatEnergyGainedEvent
  | CombatUltimateReleasedEvent
  | CombatUltimateDamageEvent
  | CombatStatusAppliedEvent
  | CombatShieldAppliedEvent
  | CombatUnitDefeatedEvent
  | CombatEndedEvent;

export type UltimateReleaseRejection =
  | 'combat-ended'
  | 'hero-not-found'
  | 'hero-downed'
  | 'energy-not-full'
  | 'ultimate-not-configured';

export interface UltimateReleaseResult {
  readonly accepted: boolean;
  readonly rejection?: UltimateReleaseRejection;
  readonly state: CombatState;
  readonly events: readonly CombatEvent[];
}

export interface HeroCombatPersistence {
  readonly health: number;
  readonly energy: number;
}

export interface CombatAdvanceResult {
  readonly state: CombatState;
  readonly events: readonly CombatEvent[];
  readonly processedSteps: number;
  readonly discardedMs: number;
}

export interface CombatSimulationResult {
  readonly state: CombatState;
  readonly events: readonly CombatEvent[];
  readonly timedOut: boolean;
}
