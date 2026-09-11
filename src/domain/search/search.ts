import type {
  CombatItemConfig,
  CombatItemsConfig,
  PrototypeRoomConfig,
  SearchConfig,
  SearchQualityConfig,
  SearchRewardConfig,
} from '@/src/config/types';
import { randomInteger, seedToRandomState } from '@/src/domain/combat/random';

export interface GeneratedSearchPoint {
  readonly id: string;
  readonly roomId: string;
  readonly requiresKey: boolean;
  readonly quality: SearchQualityConfig;
  readonly rewards: readonly (SearchRewardConfig | CombatItemConfig)[];
}

function deterministicRoll(seed: number, key: string, maximum: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return maximum > 0 ? hash % maximum : 0;
}

export function generateSearchPoints(
  seed: number,
  room: PrototypeRoomConfig,
  config: SearchConfig,
  combatItems: CombatItemsConfig,
): readonly GeneratedSearchPoint[] {
  if (room.kind === 'start' || room.kind === 'merchant') return [];
  const roomKind = room.kind;

  const rule = config.roomRules[roomKind];
  const pointRange = rule.maximumPoints - rule.minimumPoints + 1;
  const pointCount =
    rule.minimumPoints +
    deterministicRoll(seed, `${room.id}:count`, pointRange);
  const guaranteedLockStart = deterministicRoll(
    seed,
    `${room.id}:guaranteed-lock-start`,
    pointCount,
  );
  const guaranteedLockedIndexes = new Set(
    Array.from(
      { length: rule.minimumLockedPoints },
      (_, offset) => (guaranteedLockStart + offset) % pointCount,
    ),
  );
  const rolledLockedIndex =
    deterministicRoll(seed, `${room.id}:locked-room`, 10_000) <
    rule.lockedRoomChance * 10_000
      ? deterministicRoll(seed, `${room.id}:locked-index`, pointCount)
      : undefined;

  return Array.from({ length: pointCount }, (_, index) => {
    const requiresKey =
      guaranteedLockedIndexes.has(index) || index === rolledLockedIndex;
    const lockedQualityWeights = rule.qualityWeights.filter(
      (candidate) =>
        candidate.qualityId === 'rare' || candidate.qualityId === 'precious',
    );
    const qualityWeights =
      requiresKey && lockedQualityWeights.length > 0
        ? lockedQualityWeights
        : rule.qualityWeights;
    const totalWeight = qualityWeights.reduce(
      (total, weightedQuality) => total + weightedQuality.weight,
      0,
    );
    const qualityRoll = deterministicRoll(
      seed,
      `${room.id}:${index}:quality`,
      totalWeight,
    );
    let cursor = 0;
    const weightedQuality =
      qualityWeights.find((candidate) => {
        cursor += candidate.weight;
        return qualityRoll < cursor;
      }) ?? qualityWeights[0];
    if (!weightedQuality) throw new Error(`房间 ${room.id} 没有搜索品质权重`);

    const quality = config.qualities.find(
      (candidate) => candidate.id === weightedQuality.qualityId,
    );
    if (!quality)
      throw new Error(`搜索品质 ${weightedQuality.qualityId} 不存在`);
    const rewards = config.rewards.filter(
      (candidate) => candidate.qualityId === quality.id,
    );
    const rewardCountWeightTotal = config.rewardCountWeights.reduce(
      (total, weightedCount) => total + weightedCount.weight,
      0,
    );
    const rewardCountRoll = deterministicRoll(
      seed,
      `${room.id}:${index}:reward-count`,
      rewardCountWeightTotal,
    );
    let rewardCountCursor = 0;
    const weightedRewardCount =
      config.rewardCountWeights.find((candidate) => {
        rewardCountCursor += candidate.weight;
        return rewardCountRoll < rewardCountCursor;
      }) ?? config.rewardCountWeights[0];
    if (!weightedRewardCount) throw new Error('搜索物品数量权重为空');
    const generatedRewards = Array.from(
      { length: weightedRewardCount.count },
      (_, rewardIndex) => {
        const combatItemRoll =
          deterministicRoll(
            seed,
            `${room.id}:${index}:reward:${rewardIndex}:category`,
            10_000,
          ) / 10_000;
        const relicNature =
          deterministicRoll(
            seed,
            `${room.id}:${index}:reward:${rewardIndex}:nature`,
            2,
          ) === 0
            ? 'physical'
            : 'ghost';
        const matchingCombatItems = combatItems.items.filter(
          (candidate) => candidate.nature === relicNature,
        );
        const shouldDropCombatItem =
          matchingCombatItems.length > 0 &&
          combatItemRoll < combatItems.dropChanceByRoomKind[roomKind];
        if (!shouldDropCombatItem) {
          return rewards[
            deterministicRoll(
              seed,
              `${room.id}:${index}:reward:${rewardIndex}:valuable`,
              rewards.length,
            )
          ];
        }

        const totalDropWeight = matchingCombatItems.reduce(
          (total, item) => total + item.dropWeight,
          0,
        );
        // FNV's lowest bit correlates across keys: modulo 2 for nature and
        // modulo 6 for item would permanently exclude half of each color.
        const itemRoll = randomInteger(
          seedToRandomState(
            `${seed}:${room.id}:${index}:reward:${rewardIndex}:combat-item`,
          ),
          0,
          totalDropWeight - 1,
        ).value;
        let itemCursor = 0;
        return (
          matchingCombatItems.find((item) => {
            itemCursor += item.dropWeight;
            return itemRoll < itemCursor;
          }) ?? matchingCombatItems[0]
        );
      },
    );
    if (generatedRewards.some((reward) => !reward)) {
      throw new Error(`搜索品质 ${quality.id} 没有奖励`);
    }

    return {
      id: `${room.id}-search-${index + 1}`,
      roomId: room.id,
      requiresKey,
      quality,
      rewards: generatedRewards as readonly (
        | SearchRewardConfig
        | CombatItemConfig
      )[],
    };
  });
}
