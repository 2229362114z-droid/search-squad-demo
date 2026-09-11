import Ajv, { type ErrorObject } from 'ajv';

import type {
  CharactersConfig,
  CombatItemsConfig,
  CombatRulesConfig,
  EconomyConfig,
  EnemiesConfig,
  ExplorationEventsConfig,
  GameConfig,
  InventoryConfig,
  PrototypeRunConfig,
  SearchConfig,
  SessionConfig,
  SuppliesConfig,
  TerrorConfig,
} from '@/src/config/types';

interface ConfigModuleDescriptor {
  readonly id: string;
  readonly path: string;
  readonly schema: string;
}

export interface ConfigManifest {
  readonly schemaVersion: number;
  readonly configVersion: string;
  readonly modules: readonly ConfigModuleDescriptor[];
}

type ConfigRecord = Readonly<Record<string, unknown>>;

export class ConfigLoadError extends Error {
  constructor(
    message: string,
    readonly moduleId?: string,
    readonly errors?: readonly ErrorObject[] | null,
  ) {
    super(message);
    this.name = 'ConfigLoadError';
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new ConfigLoadError(
      `无法加载配置：${url}（HTTP ${response.status}）`,
    );
  }
  return (await response.json()) as T;
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function requiredModule<T>(modules: ConfigRecord, id: string): T {
  const value = modules[id];
  if (!value)
    throw new ConfigLoadError(`配置 Manifest 缺少必需模块：${id}`, id);
  return value as T;
}

export function buildGameConfig(
  manifest: ConfigManifest,
  schemas: ConfigRecord,
  modules: ConfigRecord,
): GameConfig {
  const ajv = new Ajv({ allErrors: true, strict: true });

  for (const descriptor of manifest.modules) {
    const schema = schemas[descriptor.id];
    const data = modules[descriptor.id];
    if (!schema || !data) {
      throw new ConfigLoadError(
        `模块 ${descriptor.id} 的 Schema 或数据缺失`,
        descriptor.id,
      );
    }
    const validate = ajv.compile(schema);
    if (!validate(data)) {
      throw new ConfigLoadError(
        `配置模块 ${descriptor.id} 校验失败`,
        descriptor.id,
        validate.errors,
      );
    }
  }

  const session = requiredModule<SessionConfig>(modules, 'session');
  const inventory = requiredModule<InventoryConfig>(modules, 'inventory');
  const terror = requiredModule<TerrorConfig>(modules, 'terror');
  const supplies = requiredModule<SuppliesConfig>(modules, 'supplies');
  const events = requiredModule<ExplorationEventsConfig>(modules, 'events');
  if (
    new Set(events.difficulties.map((difficulty) => difficulty.id)).size !==
      events.difficulties.length ||
    events.difficulties.some(
      (difficulty) =>
        events.dc + difficulty.dcOffset < 3 ||
        events.dc + difficulty.dcOffset > 18,
    ) ||
    Math.abs(
      events.difficulties.reduce(
        (sum, difficulty) => sum + difficulty.dcOffset * difficulty.weight,
        0,
      ),
    ) > 0.000001
  ) {
    throw new ConfigLoadError(
      '事件难度必须唯一、DC在3至18之间且加权偏移为0',
      'events',
    );
  }
  if (
    new Set(events.items.map((event) => event.id)).size !== events.items.length
  )
    throw new ConfigLoadError('events 中存在重复事件类型', 'events');
  if (
    supplies.items.length < 3 ||
    !supplies.items.some((item) => item.effect.type === 'reroll_event_die')
  )
    throw new ConfigLoadError('事件需要至少3种补给和单骰重投道具', 'events');
  const combatItems = requiredModule<CombatItemsConfig>(
    modules,
    'combat_items',
  );
  const characters = requiredModule<CharactersConfig>(modules, 'characters');
  const economy = requiredModule<EconomyConfig>(modules, 'economy');
  const search = requiredModule<SearchConfig>(modules, 'search');
  const combatRules = requiredModule<CombatRulesConfig>(
    modules,
    'combat_rules',
  );
  const enemies = requiredModule<EnemiesConfig>(modules, 'enemies');
  const prototypeRun = requiredModule<PrototypeRunConfig>(
    modules,
    'prototype_run',
  );

  const suppliesById = new Map(supplies.items.map((item) => [item.id, item]));
  if (suppliesById.size !== supplies.items.length) {
    throw new ConfigLoadError('supplies 中存在重复 ID', 'supplies');
  }
  for (const item of supplies.items) {
    if (item.width > inventory.width || item.height > inventory.height) {
      throw new ConfigLoadError(`物品 ${item.id} 无法放入背包`, 'supplies');
    }
  }

  const combatItemsById = new Map(
    combatItems.items.map((item) => [item.id, item]),
  );
  if (combatItemsById.size !== combatItems.items.length) {
    throw new ConfigLoadError('combat_items 中存在重复 ID', 'combat_items');
  }
  for (const item of combatItems.items) {
    if (
      item.targetCharacterId &&
      !characters.characters.some((c) => c.id === item.targetCharacterId)
    )
      throw new ConfigLoadError(
        `遗物 ${item.id} 引用了不存在的角色`,
        'combat_items',
      );
    if (item.width > inventory.width || item.height > inventory.height) {
      throw new ConfigLoadError(
        `临时战力物品 ${item.id} 无法放入背包`,
        'combat_items',
      );
    }
  }

  const charactersById = new Map(
    characters.characters.map((character) => [character.id, character]),
  );
  if (charactersById.size !== characters.characters.length) {
    throw new ConfigLoadError('characters 中存在重复 ID', 'characters');
  }
  for (const character of characters.characters) {
    if (character.attackIntervalMs < combatRules.fixedStepMs) {
      throw new ConfigLoadError(
        `角色 ${character.id} 的攻击间隔小于战斗固定步长`,
        'characters',
      );
    }
  }

  const enemiesById = new Map(
    enemies.enemies.map((enemy) => [enemy.id, enemy]),
  );
  if (enemiesById.size !== enemies.enemies.length) {
    throw new ConfigLoadError('enemies 中存在重复 ID', 'enemies');
  }
  for (const enemy of enemies.enemies) {
    if (enemy.attackIntervalMs < combatRules.fixedStepMs) {
      throw new ConfigLoadError(
        `敌人 ${enemy.id} 的攻击间隔小于战斗固定步长`,
        'enemies',
      );
    }
  }
  if (
    combatRules.dangerScaling.minimumDanger >=
    combatRules.dangerScaling.maximumDanger
  ) {
    throw new ConfigLoadError('combat_rules 的危险度范围无效', 'combat_rules');
  }
  for (const [kind, rule] of Object.entries(combatRules.encounterRules)) {
    if (rule.minimumUnits > rule.maximumUnits) {
      throw new ConfigLoadError(`${kind} 遭遇单位数量范围无效`, 'combat_rules');
    }
    if (
      rule.requiredTier &&
      !enemies.enemies.some((enemy) => enemy.tier === rule.requiredTier)
    ) {
      throw new ConfigLoadError(`${kind} 遭遇缺少必需阶级敌人`, 'combat_rules');
    }
    if (
      !enemies.enemies.some((enemy) => rule.allowedTiers.includes(enemy.tier))
    ) {
      throw new ConfigLoadError(`${kind} 遭遇没有可生成的敌人`, 'combat_rules');
    }
  }

  const qualityIds = new Set(search.qualities.map((quality) => quality.id));
  if (qualityIds.size !== search.qualities.length) {
    throw new ConfigLoadError('search 中存在重复品质 ID', 'search');
  }
  const rewardIds = new Set(search.rewards.map((reward) => reward.id));
  if (rewardIds.size !== search.rewards.length) {
    throw new ConfigLoadError('search 中存在重复奖励 ID', 'search');
  }
  const searchRewardsById = new Map(
    search.rewards.map((reward) => [reward.id, reward]),
  );
  const inventoryDefinitionIds = [
    ...supplies.items.map((item) => item.id),
    ...search.rewards.map((reward) => reward.id),
    ...combatItems.items.map((item) => item.id),
  ];
  if (new Set(inventoryDefinitionIds).size !== inventoryDefinitionIds.length) {
    throw new ConfigLoadError('物品 ID 在补给、战利品或临时战力物品之间重复');
  }
  const rewardCounts = new Set(
    search.rewardCountWeights.map((weightedCount) => weightedCount.count),
  );
  if (rewardCounts.size !== search.rewardCountWeights.length) {
    throw new ConfigLoadError('search 中存在重复的物品数量权重', 'search');
  }
  const rewardCountWeightTotal = search.rewardCountWeights.reduce(
    (total, weightedCount) => total + weightedCount.weight,
    0,
  );
  const configuredAverage =
    search.rewardCountWeights.reduce(
      (total, weightedCount) =>
        total + weightedCount.count * weightedCount.weight,
      0,
    ) / rewardCountWeightTotal;
  if (
    Math.abs(configuredAverage - search.targetAverageRewardsPerPoint) > 0.001
  ) {
    throw new ConfigLoadError('search 的物品数量权重不符合目标均值', 'search');
  }
  for (const reward of search.rewards) {
    if (!qualityIds.has(reward.qualityId)) {
      throw new ConfigLoadError(
        `搜索奖励 ${reward.id} 引用了不存在的品质`,
        'search',
      );
    }
    if (reward.width > inventory.width || reward.height > inventory.height) {
      throw new ConfigLoadError(`搜索奖励 ${reward.id} 无法放入背包`, 'search');
    }
  }
  for (const item of combatItems.items) {
    if (
      item.targetCharacterId &&
      !characters.characters.some((c) => c.id === item.targetCharacterId)
    )
      throw new ConfigLoadError(
        `遗物 ${item.id} 引用了不存在的角色`,
        'combat_items',
      );
    if (!qualityIds.has(item.qualityId)) {
      throw new ConfigLoadError(
        `临时战力物品 ${item.id} 引用了不存在的品质`,
        'combat_items',
      );
    }
  }
  for (const nature of ['physical', 'ghost'] as const) {
    if (combatItems.items.filter((item) => item.nature === nature).length < 2)
      throw new ConfigLoadError('每系至少配置两个起始遗物', 'combat_items');
    for (const tier of ['standard', 'elite', 'boss'] as const) {
      if (
        !enemies.enemies.some(
          (enemy) => enemy.nature === nature && enemy.tier === tier,
        )
      )
        throw new ConfigLoadError(`${nature}缺少${tier}敌人`, 'enemies');
    }
  }
  for (const [kind, rule] of Object.entries(search.roomRules)) {
    if (rule.minimumPoints > rule.maximumPoints) {
      throw new ConfigLoadError(`${kind} 搜索点数量范围无效`, 'search');
    }
    if (rule.minimumLockedPoints > rule.minimumPoints) {
      throw new ConfigLoadError(`${kind} 保底锁箱数量超过搜索点下限`, 'search');
    }
    for (const weightedQuality of rule.qualityWeights) {
      if (!qualityIds.has(weightedQuality.qualityId)) {
        throw new ConfigLoadError(`${kind} 引用了不存在的搜索品质`, 'search');
      }
      if (
        !search.rewards.some(
          (reward) => reward.qualityId === weightedQuality.qualityId,
        )
      ) {
        throw new ConfigLoadError(`${kind} 搜索品质没有可用奖励`, 'search');
      }
    }
  }

  const mapLayout = prototypeRun.mapLayout;
  if (
    mapLayout.minimumScale > mapLayout.defaultScale ||
    mapLayout.defaultScale > mapLayout.maximumScale
  ) {
    throw new ConfigLoadError(
      'prototype_run 的地图默认缩放必须位于最小和最大缩放之间',
      'prototype_run',
    );
  }
  if (
    mapLayout.centerToRoadRatio.minimum > mapLayout.centerToRoadRatio.maximum
  ) {
    throw new ConfigLoadError(
      'prototype_run 的地图中心距/道路长度比例范围无效',
      'prototype_run',
    );
  }

  // 地图每局随机生成，这里只校验生成规则本身是否自洽；
  // 逐张地图的硬约束由 domain/map/generate-map.ts 在生成时保证。
  const generation = prototypeRun.mapGeneration;
  const grid = generation.grid;
  const cellCount = grid.columns * grid.rows;
  const quotaTotal = Object.values(prototypeRun.expectedRoomCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (quotaTotal !== cellCount) {
    throw new ConfigLoadError(
      `房间配额合计 ${quotaTotal} 与网格容量 ${cellCount} 不一致`,
      'prototype_run',
    );
  }
  if (prototypeRun.expectedRoomCounts.start !== 1) {
    throw new ConfigLoadError('起始房必须恰好一间', 'prototype_run');
  }
  if (prototypeRun.expectedRoomCounts.boss !== 4) {
    throw new ConfigLoadError(
      'BOSS 房必须恰好四间，分别占据地图四角',
      'prototype_run',
    );
  }
  for (const [kind, count] of Object.entries(prototypeRun.expectedRoomCounts)) {
    const pool =
      generation.roomNames[kind as keyof typeof generation.roomNames] ?? [];
    if (pool.length < count) {
      throw new ConfigLoadError(
        `${kind} 房间名称池只有 ${pool.length} 个，少于配额 ${count}`,
        'prototype_run',
      );
    }
    if (new Set(pool).size !== pool.length) {
      throw new ConfigLoadError(`${kind} 房间名称池存在重复`, 'prototype_run');
    }
  }
  if (
    generation.startColumn >= grid.columns ||
    generation.startRow >= grid.rows
  ) {
    throw new ConfigLoadError('起始房坐标超出网格范围', 'prototype_run');
  }
  if (
    (generation.startColumn === 0 ||
      generation.startColumn === grid.columns - 1) &&
    (generation.startRow === 0 || generation.startRow === grid.rows - 1)
  ) {
    throw new ConfigLoadError(
      '起始房不能占用 BOSS 所在的地图角落',
      'prototype_run',
    );
  }
  if (generation.averageDegree.minimum > generation.averageDegree.maximum) {
    throw new ConfigLoadError('平均分支度区间无效', 'prototype_run');
  }
  if (generation.averageDegree.maximum > 4) {
    throw new ConfigLoadError(
      '网格四邻的平均分支度不可能超过 4',
      'prototype_run',
    );
  }
  if (generation.minimumFarthestDistance > cellCount - 1) {
    throw new ConfigLoadError('最远距离要求超过房间总数', 'prototype_run');
  }
  if (generation.minimumBossDistance > generation.minimumFarthestDistance) {
    throw new ConfigLoadError(
      'BOSS 最小距离不能超过要求的最远距离',
      'prototype_run',
    );
  }
  // 道路长度比例只取决于固定网格步长，这里一次性校验两个方向。
  for (const [label, step, span] of [
    ['水平', grid.stepX, mapLayout.worldWidth],
    ['垂直', grid.stepY, mapLayout.worldHeight],
  ] as const) {
    const centerDistance = (step / 100) * span;
    const visibleRoadLength = centerDistance - mapLayout.roomNodeSize;
    const ratio = centerDistance / visibleRoadLength;
    if (
      visibleRoadLength <= 0 ||
      ratio < mapLayout.centerToRoadRatio.minimum - 0.001 ||
      ratio > mapLayout.centerToRoadRatio.maximum + 0.001
    ) {
      throw new ConfigLoadError(
        `${label}方向的中心距/道路长度比例 ${ratio.toFixed(3)} 不在配置范围内`,
        'prototype_run',
      );
    }
  }

  // BOSS 距起点的下限必须至少覆盖危险度爬满所需的步数，否则末端 BOSS
  // 会出现在还没升到最高危险度的位置上。
  const dangerRampDistance =
    (prototypeRun.dangerRules.maximumDanger - 1) *
    prototypeRun.dangerRules.roomsPerLevel;
  if (generation.minimumBossDistance < dangerRampDistance) {
    throw new ConfigLoadError(
      `BOSS 最小距离 ${generation.minimumBossDistance} 低于危险度爬满所需的 ${dangerRampDistance} 步`,
      'prototype_run',
    );
  }

  const canonical = JSON.stringify({ manifest, modules });
  return Object.freeze({
    version: manifest.configVersion,
    hash: hashText(canonical),
    session,
    inventory,
    terror,
    supplies,
    combatItems,
    events,
    characters,
    economy,
    search,
    combatRules,
    enemies,
    prototypeRun,
    suppliesById,
    combatItemsById,
    searchRewardsById,
    charactersById,
    enemiesById,
  });
}

export async function loadGameConfig(baseUrl = '/data'): Promise<GameConfig> {
  const manifest = await fetchJson<ConfigManifest>(`${baseUrl}/manifest.json`);
  const loaded = await Promise.all(
    manifest.modules.map(async (descriptor) => {
      const [schema, data] = await Promise.all([
        fetchJson<unknown>(`${baseUrl}/${descriptor.schema}`),
        fetchJson<unknown>(`${baseUrl}/${descriptor.path}`),
      ]);
      return { id: descriptor.id, schema, data };
    }),
  );

  return buildGameConfig(
    manifest,
    Object.fromEntries(loaded.map(({ id, schema }) => [id, schema])),
    Object.fromEntries(loaded.map(({ id, data }) => [id, data])),
  );
}
