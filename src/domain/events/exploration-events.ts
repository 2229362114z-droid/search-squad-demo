import type {
  EnemyNature,
  EventDifficultyConfig,
  ExplorationEventKind,
  ExplorationEventsConfig,
  GameConfig,
} from '@/src/config/types';
import type { RelicInstance } from '@/src/domain/items/combat-items';
import {
  nextRandom,
  randomInteger,
  seedToRandomState,
  weightedIndex,
} from '@/src/domain/combat/random';

export interface ExplorationEventState {
  readonly id: string;
  readonly targetRoomId: string;
  readonly kind: ExplorationEventKind;
  readonly nature: EnemyNature;
  readonly bonus: number;
  readonly dc: number;
  readonly difficulty: EventDifficultyConfig['id'];
  readonly stage: 'unrolled' | 'rolled' | 'merchant' | 'resolved';
  readonly dice: readonly [number, number, number] | null;
  readonly rollCount: number;
  readonly randomState: number;
  readonly shopItemIds: readonly string[];
  readonly outcome: readonly string[];
}

export interface EventCombatBoost {
  readonly remainingBattles: number;
  readonly damageRatio: number;
  readonly reductionRatio: number;
}

export function createMovementEvent(
  seed: number,
  targetRoomId: string,
  relics: readonly RelicInstance[],
  config: GameConfig,
  targetNature?: EnemyNature,
): ExplorationEventState | null {
  const chance = nextRandom(
    seedToRandomState(`${seed}:${targetRoomId}:event-trigger`),
  );
  if (chance.value >= config.events.triggerChance) return null;
  const selection = weightedIndex(
    seedToRandomState(`${seed}:${targetRoomId}:event-kind`),
    config.events.items.map((item) => item.weight),
  );
  const kind = config.events.items[selection.index]!.id;
  const difficultySelection = weightedIndex(
    seedToRandomState(`${seed}:${targetRoomId}:event-difficulty`),
    config.events.difficulties.map((difficulty) => difficulty.weight),
  );
  const difficulty = config.events.difficulties[difficultySelection.index]!;
  const nature =
    targetNature ??
    (nextRandom(seedToRandomState(`${seed}:${targetRoomId}:event-nature`))
      .value < 0.5
      ? 'physical'
      : 'ghost');
  const bonus = relics.filter(
    (item) => config.combatItemsById.get(item.itemId)?.nature === nature,
  ).length;
  const shopItemIds: string[] = [];
  let shopState = seedToRandomState(`${seed}:${targetRoomId}:merchant-stock`);
  if (kind === 'merchant') {
    // 出征前买不到的补给由商人必定上架：它们没有别的稳定获取途径，
    // 交给随机抽取会让多数局根本见不到。剩余货位再从其余补给里随机抽。
    const guaranteed = config.supplies.items.filter(
      (item) => item.availableInPreparation === false,
    );
    const candidates = config.supplies.items
      .filter((item) => item.availableInPreparation !== false)
      .map((item) => item.id);
    shopItemIds.push(...guaranteed.map((item) => item.id));
    while (shopItemIds.length < 3 && candidates.length) {
      const choice = randomInteger(shopState, 0, candidates.length - 1);
      shopState = choice.state;
      shopItemIds.push(candidates.splice(choice.value, 1)[0]!);
    }
  }
  return {
    id: `${seed}:${targetRoomId}:event`,
    targetRoomId,
    kind,
    nature,
    bonus,
    dc: config.events.dc + difficulty.dcOffset,
    difficulty: difficulty.id,
    stage: 'unrolled',
    dice: null,
    rollCount: 0,
    randomState: seedToRandomState(`${seed}:${targetRoomId}:event-dice`),
    shopItemIds,
    outcome: [],
  };
}

export function eventScore(event: ExplorationEventState): number {
  return event.dice
    ? event.dice.reduce((sum, value) => sum + value, event.bonus)
    : 0;
}

export function rollEventDice(
  event: ExplorationEventState,
  dieIndex?: number,
): ExplorationEventState {
  let state = event.randomState;
  const dice: [number, number, number] = event.dice
    ? [...event.dice]
    : [1, 1, 1];
  for (let i = 0; i < 3; i++) {
    if (dieIndex !== undefined && i !== dieIndex) continue;
    const roll = randomInteger(state, 1, 6);
    state = roll.state;
    dice[i] = roll.value;
  }
  return {
    ...event,
    dice,
    randomState: state,
    stage: 'rolled',
    rollCount: event.rollCount + 1,
  };
}

export function eventSuccessChance(bonus: number, dc: number): number {
  let successes = 0;
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++)
      for (let c = 1; c <= 6; c++) {
        if (a + b + c + bonus >= dc) successes++;
      }
  return successes / 216;
}

export function eventFailureHealth(
  health: number,
  maxHealth: number,
  ratio: number,
): number {
  return health <= 0
    ? health
    : Math.min(health, Math.max(1, health - Math.ceil(maxHealth * ratio)));
}

export function consumeEventBoost(
  boost: EventCombatBoost | null,
): EventCombatBoost | null {
  return boost && boost.remainingBattles > 1
    ? { ...boost, remainingBattles: boost.remainingBattles - 1 }
    : null;
}

export function eventRewardDescription(
  kind: ExplorationEventKind,
  config: ExplorationEventsConfig,
  difficultyId: EventDifficultyConfig['id'] = 'normal',
): string {
  const reward = eventRewards(config, difficultyId);
  switch (kind) {
    case 'merchant':
      return `${reward.merchantCoins ? `高难成功谢礼${reward.merchantCoins}铜币；` : ''}与商人交易：随机3种初始物资，原价购买，可使用或丢弃随身物品。`;
    case 'healing':
      return `全队共回复${reward.healAmount}点生命，优先治疗低血线队员，不复活。`;
    case 'boost':
      return `之后${reward.boost.battles}场战斗：全队伤害+${Math.round(reward.boost.damageRatio * 100)}%，承伤-${Math.round(reward.boost.reductionRatio * 100)}%；可与护身符叠加，重复获得刷新次数并保留较强幅度。`;
    case 'energy':
      return `每位存活队员回复能量上限的${Math.round(reward.energyRatio * 100)}%。`;
    case 'calm':
      return `恐怖值降低${reward.terrorReduction}点。`;
    case 'supplies':
      return `随机获得${reward.supplyCount}份未达上限且可装入的补给；每份无法收取时改得${config.supplyFallbackCoins}铜币。`;
  }
}

export function eventRewards(
  config: ExplorationEventsConfig,
  difficultyId: EventDifficultyConfig['id'],
) {
  const difficulty = config.difficulties.find(
    (item) => item.id === difficultyId,
  )!;
  const multiplier = difficulty.rewardMultiplier;
  return {
    healAmount: config.healAmount * multiplier,
    energyRatio: Math.min(1, config.energyRatio * multiplier),
    terrorReduction: config.terrorReduction * multiplier,
    supplyCount: multiplier,
    merchantCoins: difficulty.merchantCoins,
    boost: {
      battles: config.boost.battles,
      damageRatio: config.boost.damageRatio * multiplier,
      reductionRatio: Math.min(0.9, config.boost.reductionRatio * multiplier),
    },
  };
}

/** Stable per-room stock; revisiting never rerolls it. */
export function createMerchantStock(
  seed: number,
  roomId: string,
  config: GameConfig,
): readonly string[] {
  const stock = config.supplies.items
    .filter((item) => item.availableInPreparation === false)
    .map((item) => item.id);
  const candidates = config.supplies.items
    .filter((item) => item.availableInPreparation !== false)
    .map((item) => item.id);
  let state = seedToRandomState(`${seed}:${roomId}:merchant-stock`);
  while (stock.length < 3 && candidates.length) {
    const choice = randomInteger(state, 0, candidates.length - 1);
    state = choice.state;
    stock.push(candidates.splice(choice.value, 1)[0]!);
  }
  return stock;
}
