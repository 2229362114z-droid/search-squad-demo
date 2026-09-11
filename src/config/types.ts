export type SupplyEffect =
  | { readonly type: 'heal_team'; readonly amount: number }
  | { readonly type: 'revive_member'; readonly healthRatio: number }
  | { readonly type: 'reduce_terror'; readonly amount: number }
  | {
      readonly type: 'next_combat_boost';
      readonly damageRatio: number;
      readonly reductionRatio: number;
    }
  | { readonly type: 'unlock_chest'; readonly amount: number }
  | { readonly type: 'reroll_event_die' }
  | {
      readonly type: 'next_combat_off_nature';
      readonly featureRatio: number;
    };

export type ExplorationEventKind =
  | 'merchant'
  | 'healing'
  | 'boost'
  | 'energy'
  | 'calm'
  | 'supplies';
export interface EventDifficultyConfig {
  readonly id: 'normal' | 'advanced' | 'hard';
  readonly displayName: string;
  readonly dcOffset: number;
  readonly weight: number;
  readonly rewardMultiplier: number;
  readonly merchantCoins: number;
}
export interface ExplorationEventsConfig {
  readonly schemaVersion: number;
  readonly triggerChance: number;
  readonly dc: number;
  readonly difficulties: readonly EventDifficultyConfig[];
  readonly failureHealthRatio: number;
  readonly healAmount: number;
  readonly energyRatio: number;
  readonly terrorReduction: number;
  readonly supplyFallbackCoins: number;
  readonly boost: {
    readonly battles: number;
    readonly damageRatio: number;
    readonly reductionRatio: number;
  };
  readonly items: readonly {
    readonly id: ExplorationEventKind;
    readonly weight: number;
    readonly physical: { readonly title: string; readonly description: string };
    readonly ghost: { readonly title: string; readonly description: string };
  }[];
}

export interface SupplyConfig {
  readonly maxCarry: number;
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly artId: string;
  readonly price: number;
  readonly width: number;
  readonly height: number;
  readonly maxStack: number;
  readonly effect: SupplyEffect;
  /** 省略即可在出征前的初始商店购买；置 false 表示只能在局内商店或事件获得。 */
  readonly availableInPreparation?: boolean;
}

export type CharacterUltimateConfig =
  | {
      readonly type: 'highest_threat_barrage';
      readonly hitCount: number;
      readonly damageRatioPerHit: number;
    }
  | {
      readonly type: 'taunt_and_reduce_damage';
      readonly durationMs: number;
      readonly aggroMultiplier: number;
      readonly damageReductionRatio: number;
    }
  | {
      readonly type: 'all_enemy_damage_and_stun';
      readonly damageRatio: number;
      readonly stunDurationMs: number;
    }
  | {
      readonly type: 'team_shield';
      readonly shieldAmount: number;
      readonly durationMs: number;
    };

export interface CharacterConfig {
  readonly id: string;
  readonly displayName: string;
  readonly role: string;
  readonly artId: string;
  readonly maxHealth: number;
  readonly attack: number;
  readonly attackIntervalMs: number;
  readonly baseAggro: number;
  readonly energyOnAttackHit: number;
  readonly energyOnDamageTaken: number;
  readonly ultimate: CharacterUltimateConfig;
}

export interface SessionConfig {
  readonly schemaVersion: number;
  readonly baselineWidth: number;
  readonly baselineHeight: number;
  readonly sceneHeight: number;
  readonly extractionDurationMs: number;
  readonly prototypeCombatDurationMs: number;
  readonly backgroundClockPaused: boolean;
}

export interface InventoryConfig {
  readonly schemaVersion: number;
  readonly width: number;
  readonly height: number;
  readonly allowRotation: false;
  readonly autoPlacementOrder: 'row_major';
}

export interface TerrorConfig {
  readonly schemaVersion: number;
  readonly maximum: number;
  readonly movementGain: number;
  readonly fullDamageRatio: number;
  readonly calmingIncenseReduction: number;
  readonly bypassCombatMitigation: true;
}

export interface SuppliesConfig {
  readonly schemaVersion: number;
  readonly items: readonly SupplyConfig[];
}

export type CombatItemEffect =
  | { readonly type: 'damage_reduction'; readonly ratio: number }
  | { readonly type: 'shield_power'; readonly ratio: number }
  | { readonly type: 'basic_damage'; readonly ratio: number }
  | { readonly type: 'attack_speed'; readonly ratio: number }
  | { readonly type: 'lifesteal'; readonly ratio: number }
  | { readonly type: 'energy_gain'; readonly ratio: number }
  | {
      readonly type: 'ultimate_shield';
      readonly amount: number;
      readonly durationMs: number;
    }
  | {
      readonly type: 'ultimate_power';
      readonly ratio: number;
      readonly stunBonusMs: number;
    };

export type EnemyNature = 'physical' | 'ghost';

export interface CombatItemConfig {
  readonly targetCharacterId?: string;
  readonly baseDamageRatio: number;
  readonly baseReductionRatio: number;
  readonly nature: EnemyNature;
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly artId: string;
  readonly qualityId: string;
  readonly value: 0;
  readonly width: 1;
  readonly height: 1;
  readonly maxStack: 1;
  readonly dropWeight: number;
  readonly effect: CombatItemEffect;
}

export interface CombatItemsConfig {
  readonly schemaVersion: number;
  readonly dropChanceByRoomKind: Readonly<
    Record<'combat' | 'elite' | 'treasure' | 'boss', number>
  >;
  readonly items: readonly CombatItemConfig[];
}

export interface CharactersConfig {
  readonly schemaVersion: number;
  readonly movementSpeed: number;
  readonly characters: readonly CharacterConfig[];
}

export type EnemyTier = 'standard' | 'elite' | 'boss';

export interface EnemyConfig {
  readonly nature: EnemyNature;
  readonly id: string;
  readonly displayName: string;
  readonly artId: string;
  readonly tier: EnemyTier;
  readonly maxHealth: number;
  readonly attack: number;
  readonly attackIntervalMs: number;
  readonly baseThreat: number;
  readonly frontlineOrder: number;
  readonly spawnWeight: number;
}

export interface EnemiesConfig {
  readonly schemaVersion: number;
  readonly enemies: readonly EnemyConfig[];
}

export interface CombatEncounterRuleConfig {
  readonly minimumUnits: number;
  readonly maximumUnits: number;
  readonly healthMultiplier: number;
  readonly damageMultiplier: number;
  readonly requiredTier: Extract<EnemyTier, 'elite' | 'boss'> | null;
  readonly allowedTiers: readonly EnemyTier[];
}

export type CombatRoomKindKey = 'combat' | 'elite' | 'boss';

export interface CombatRulesConfig {
  readonly schemaVersion: number;
  readonly fixedStepMs: number;
  readonly maxCatchUpSteps: number;
  readonly simulationTimeoutMs: number;
  readonly maximumEnergy: number;
  readonly minimumDamage: number;
  readonly damageVarianceRatio: number;
  readonly criticalChance: number;
  readonly criticalMultiplier: number;
  readonly dangerScaling: {
    readonly minimumDanger: number;
    readonly maximumDanger: number;
    readonly healthPerLevel: number;
    readonly damagePerLevel: number;
  };
  readonly threatModifiers: {
    readonly castingWarningBonus: number;
    readonly eliteBonus: number;
    readonly bossBonus: number;
  };
  readonly nonBossProgression: Readonly<
    Record<
      'combat' | 'elite',
      {
        readonly farHealthRatio: number;
        readonly farDamagePerSecondRatio: number;
      }
    >
  >;
  /** 按房型缩放整场生命与输出；BOSS 单独取值，用于抬高通关门槛。 */
  readonly difficultyScale: Readonly<Record<CombatRoomKindKey, number>>;
  readonly encounterRules: Readonly<
    Record<'combat' | 'elite' | 'boss', CombatEncounterRuleConfig>
  >;
}

export interface EconomyConfig {
  readonly schemaVersion: number;
  readonly initialCoins: number;
  readonly failureSafetyThreshold: number;
  readonly failureSafetyGrant: number;
  readonly refreshDuringRunIsFailure: true;
  readonly growth: {
    readonly effectPerLevel: number;
    readonly upgradeCosts: readonly number[];
    readonly foresightUpgradeCosts: readonly number[];
  };
}

export interface SearchQualityConfig {
  readonly id: string;
  readonly displayName: string;
  readonly durationMs: number;
  readonly color: string;
}

export interface SearchRewardConfig {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly artId: string;
  readonly qualityId: string;
  readonly value: number;
  readonly width: number;
  readonly height: number;
  readonly maxStack: number;
}

export interface SearchRoomRuleConfig {
  readonly minimumPoints: number;
  readonly maximumPoints: number;
  readonly minimumLockedPoints: number;
  readonly lockedRoomChance: number;
  readonly qualityWeights: readonly {
    readonly qualityId: string;
    readonly weight: number;
  }[];
}

export interface SearchConfig {
  readonly schemaVersion: number;
  readonly autoSearcherCount: number;
  readonly minimumApproachDurationMs: number;
  readonly targetAverageRewardsPerPoint: number;
  readonly rewardCountWeights: readonly {
    readonly count: number;
    readonly weight: number;
  }[];
  readonly qualities: readonly SearchQualityConfig[];
  readonly rewards: readonly SearchRewardConfig[];
  readonly roomRules: Readonly<
    Record<'combat' | 'elite' | 'treasure' | 'boss', SearchRoomRuleConfig>
  >;
}

export interface PrototypeRoomConfig {
  readonly nature?: EnemyNature;
  readonly id: string;
  readonly displayName: string;
  readonly kind:
    | 'start'
    | 'combat'
    | 'elite'
    | 'treasure'
    | 'boss'
    | 'merchant';
  readonly danger: number;
  readonly x: number;
  readonly y: number;
  readonly neighbors: readonly string[];
}

export interface PrototypeMapLayoutConfig {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly roomNodeSize: number;
  readonly roadStrokeWidth: number;
  readonly minimumScale: number;
  readonly maximumScale: number;
  readonly defaultScale: number;
  readonly panGutter: number;
  readonly centerToRoadRatio: {
    readonly minimum: number;
    readonly maximum: number;
  };
}

export interface PrototypeDangerRulesConfig {
  readonly roomsPerLevel: number;
  readonly maximumDanger: number;
  readonly bossDanger: number;
}

export interface MapGenerationConfig {
  readonly grid: {
    readonly columns: number;
    readonly rows: number;
    readonly originX: number;
    readonly originY: number;
    readonly stepX: number;
    readonly stepY: number;
  };
  readonly startColumn: number;
  readonly startRow: number;
  readonly averageDegree: {
    readonly minimum: number;
    readonly maximum: number;
  };
  readonly minimumFarthestDistance: number;
  readonly minimumBossDistance: number;
  readonly minimumBossSeparation: number;
  readonly minimumEliteDistance: number;
  readonly minimumNatureEliteCount: number;
  readonly maximumNatureCombatGap: number;
  readonly maximumAttempts: number;
  readonly roomNames: Readonly<
    Record<PrototypeRoomConfig['kind'], readonly string[]>
  >;
}

export interface PrototypeRunConfig {
  readonly schemaVersion: number;
  readonly startRoomId: string;
  readonly maximumTreasureClusterSize: number;
  readonly mapLayout: PrototypeMapLayoutConfig;
  readonly dangerRules: PrototypeDangerRulesConfig;
  readonly expectedRoomCounts: Readonly<
    Record<
      'start' | 'combat' | 'elite' | 'treasure' | 'boss' | 'merchant',
      number
    >
  >;
  readonly mapGeneration: MapGenerationConfig;
}

export interface GameConfig {
  readonly events: ExplorationEventsConfig;
  readonly version: string;
  readonly hash: string;
  readonly session: SessionConfig;
  readonly inventory: InventoryConfig;
  readonly terror: TerrorConfig;
  readonly supplies: SuppliesConfig;
  readonly combatItems: CombatItemsConfig;
  readonly characters: CharactersConfig;
  readonly economy: EconomyConfig;
  readonly search: SearchConfig;
  readonly combatRules: CombatRulesConfig;
  readonly enemies: EnemiesConfig;
  readonly prototypeRun: PrototypeRunConfig;
  readonly suppliesById: ReadonlyMap<string, SupplyConfig>;
  readonly combatItemsById: ReadonlyMap<string, CombatItemConfig>;
  readonly searchRewardsById: ReadonlyMap<string, SearchRewardConfig>;
  readonly charactersById: ReadonlyMap<string, CharacterConfig>;
  readonly enemiesById: ReadonlyMap<string, EnemyConfig>;
}
