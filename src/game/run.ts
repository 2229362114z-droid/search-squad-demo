/**
 * 探索运行时（对齐公网版玩法）：
 * - 搜索点：domain generateSearchPoints 确定性生成（品质权重、上锁宝箱、战斗道具掉落）
 * - 恐怖值：每换房 +movementGain，满值后每房存活队员损 maxHp*fullDamageRatio（previewTerrorMove）
 * - 铜钥匙：初始 2 把，开启上锁搜索点；商店房可补给（后续接商店）
 * - 撤离：战利品全额变现，军械保留；全灭战利品遗失
 */

import type { GameConfig, SearchRewardConfig, CombatItemConfig } from '@/src/config/types';
import { generateSearchPoints } from '@/src/domain/search/search';
import { previewTerrorMove, type PartyMemberHealth } from '@/src/domain/terror/terror';
import type { DemoMap, DemoRoom } from '@/src/game/map-gen';
import { generateDemoMap } from '@/src/game/map-gen';
import { runBattle, type BattleOutcome } from '@/src/game/bridge';

export type RunPhase = 'movement' | 'looting' | 'finished';

export interface LootEntry {
  readonly instanceId: string;
  readonly nm: string;
  readonly value: number;
  readonly artId: string;
  readonly quality: string;
}

export interface SearchPointView {
  readonly id: string;
  readonly requiresKey: boolean;
  readonly qualityName: string;
  readonly qualityColor: string;
  readonly searched: boolean;
}

export interface RunState {
  readonly seed: string;
  readonly map: DemoMap;
  readonly currentRoomId: string;
  readonly phase: RunPhase;
  readonly visitedRooms: ReadonlySet<string>;
  readonly searchedPoints: ReadonlySet<string>;
  readonly equipped: Readonly<Record<number, number>>;
  readonly picks: readonly number[];
  readonly loot: readonly LootEntry[];
  readonly heroHealth: Readonly<Record<number, number>>;
  readonly terror: number;
  readonly keys: number;
  readonly coins: number;
  readonly result: 'none' | 'extracted' | 'wiped';
  readonly log: readonly string[];
}

function seedToNumber(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRun(
  config: GameConfig,
  seed: string,
  equipped: Readonly<Record<number, number>>,
  picks: readonly number[],
): RunState {
  const map = generateDemoMap(seed);
  const startRoom = map.rooms.find((r) => r.kind === 'start')!;
  const heroHealth: Record<number, number> = {};
  for (const id of picks) heroHealth[id] = -1; // -1 = 满血
  return {
    seed,
    map,
    currentRoomId: startRoom.id,
    phase: 'movement',
    visitedRooms: new Set([startRoom.id]),
    searchedPoints: new Set(),
    equipped,
    picks: [...picks],
    loot: [],
    heroHealth,
    terror: 0,
    keys: 2,
    coins: 0,
    result: 'none',
    log: [`小队从【${startRoom.displayName}】进入墓道。`],
  };
}

export function neighborsOf(state: RunState): readonly DemoRoom[] {
  return state.map.rooms.filter((r) =>
    r.neighbors.includes(state.currentRoomId),
  );
}

export function roomOf(state: RunState, roomId?: string): DemoRoom {
  const id = roomId ?? state.currentRoomId;
  return state.map.rooms.find((r) => r.id === id)!;
}

/** 当前房间可见的搜索点（战斗房/精英/宝藏/BOSS 有，起点/商店没有） */
export function searchPointsOf(
  config: GameConfig,
  state: RunState,
): readonly SearchPointView[] {
  const room = roomOf(state);
  if (room.kind === 'start' || room.kind === 'merchant') return [];
  if (!state.visitedRooms.has(room.id)) return [];
  const points = generateSearchPoints(
    seedToNumber(`${state.seed}:${room.id}`),
    room as Parameters<typeof generateSearchPoints>[1],
    config.search,
    config.combatItems,
  );
  return points.map((point) => {
    const quality = config.search.qualities.find(
      (q) => q.id === point.quality.id,
    );
    return {
      id: point.id,
      requiresKey: point.requiresKey,
      qualityName: quality?.displayName ?? '普通',
      qualityColor: quality?.color ?? '#d2d0c8',
      searched: state.searchedPoints.has(point.id),
    };
  });
}

export interface MoveResult {
  readonly state: RunState;
  readonly outcome?: BattleOutcome;
  readonly terrorDamage?: Readonly<Record<number, number>>;
}

function partyHealth(state: RunState): PartyMemberHealth[] {
  return state.picks.map((id) => ({
    id: String(id),
    health: state.heroHealth[id] === -1 ? 9999 : (state.heroHealth[id] ?? 0),
    maxHealth: 9999,
  }));
}

/** 移动到相邻房间：战斗房开战、其余直接进入；恐怖值在移动时结算 */
export function moveTo(
  config: GameConfig,
  state: RunState,
  roomId: string,
): MoveResult {
  const room = state.map.rooms.find((r) => r.id === roomId);
  if (!room || !room.neighbors.includes(state.currentRoomId)) {
    return { state };
  }
  if (state.phase === 'looting') {
    state = {
      ...state,
      phase: 'movement',
      log: [...state.log, '离开房间，未完成的搜索已放弃。'],
    };
  }
  if (state.phase !== 'movement') return { state };

  // 恐怖值结算（domain previewTerrorMove）
  const terrorConfig = config.terror;
  const before = state.terror;
  const party = partyHealth(state);
  const preview = previewTerrorMove(before, party, terrorConfig);
  const heroHealth: Record<number, number> = { ...state.heroHealth };
  let terrorLog = '';
  if (Object.keys(preview.damageByMember).length > 0) {
    for (const [memberId, damage] of Object.entries(preview.damageByMember)) {
      const heroId = Number(memberId);
      const current = heroHealth[heroId] === -1 ? 9999 : heroHealth[heroId]!;
      heroHealth[heroId] = Math.max(1, current - damage);
    }
    terrorLog = `恐怖侵蚀：全员损失部分生命（恐怖 ${before}→${preview.nextTerror}）。`;
  }
  const terror = preview.nextTerror;

  // 战斗房
  if (room.kind === 'combat' || room.kind === 'elite' || room.kind === 'boss') {
    const battleSeed = `${state.seed}:${room.id}`;
    const outcome = runBattle(
      config,
      state.picks,
      state.equipped,
      {
        nature: room.nature,
        danger: room.danger,
        isBoss: room.kind === 'boss',
      },
      battleSeed,
      normalizeHealth(heroHealth),
    );
    const visited = new Set(state.visitedRooms);
    visited.add(room.id);
    for (const [heroId, hp] of Object.entries(outcome.heroHealthOut)) {
      heroHealth[Number(heroId)] = hp;
    }

    if (!outcome.win) {
      const revived: Record<number, number> = {};
      for (const id of state.picks) revived[id] = 1;
      return {
        state: {
          ...state,
          phase: 'movement',
          visitedRooms: visited,
          heroHealth: revived,
          loot: [],
          terror,
          currentRoomId: state.map.rooms.find((r) => r.kind === 'start')!.id,
          result: 'wiped',
          log: [
            ...state.log,
            terrorLog,
            `全队在【${room.displayName}】倒下！战利品遗失，军械保留，伤重撤回起点。`,
          ].filter(Boolean),
        },
        outcome,
      };
    }

    return {
      state: {
        ...state,
        phase: 'looting',
        visitedRooms: visited,
        heroHealth,
        terror,
        currentRoomId: room.id,
        log: [
          ...state.log,
          terrorLog,
          `战斗胜利（${outcome.seconds.toFixed(1)}秒）：【${room.displayName}】已清理。`,
        ].filter(Boolean),
      },
      outcome,
    };
  }

  // 非战斗房
  const visited = new Set(state.visitedRooms);
  visited.add(room.id);
  const isTreasure = room.kind === 'treasure';
  return {
    state: {
      ...state,
      phase: isTreasure ? 'looting' : 'movement',
      visitedRooms: visited,
      heroHealth,
      terror,
      currentRoomId: room.id,
      log: [
        ...state.log,
        terrorLog,
        isTreasure
          ? `抵达【${room.displayName}】，可以搜刮。`
          : `经过【${room.displayName}】。`,
      ].filter(Boolean),
    },
  };
}

/** 搜一个搜索点：奖励入包（战利品变现价值），上锁需铜钥匙 */
export function searchPoint(
  config: GameConfig,
  state: RunState,
  pointId: string,
): { state: RunState; gained: readonly LootEntry[]; error?: string } {
  const room = roomOf(state);
  const points = generateSearchPoints(
    seedToNumber(`${state.seed}:${room.id}`),
    room as Parameters<typeof generateSearchPoints>[1],
    config.search,
    config.combatItems,
  );
  const point = points.find((p) => p.id === pointId);
  if (!point) return { state, gained: [] };
  if (state.searchedPoints.has(pointId))
    return { state, gained: [], error: '已搜索过' };
  if (point.requiresKey && state.keys <= 0)
    return { state, gained: [], error: '需要铜钥匙' };

  const searched = new Set(state.searchedPoints);
  searched.add(pointId);
  const gained: LootEntry[] = point.rewards.map((reward, index) => {
    const r = reward as unknown as {
      displayName: string;
      value?: number;
      artId?: string;
      nature?: string;
    };
    const isCombatItem = r.nature != null;
    return {
      instanceId: `${pointId}:${index}`,
      nm: r.displayName,
      value: isCombatItem
        ? Math.max(20, Math.round((r.value ?? 80) / 4))
        : (r.value ?? 20),
      artId: r.artId ?? 'valuable_copper_coin',
      quality: point.quality.id,
    };
  });

  const keys = point.requiresKey ? state.keys - 1 : state.keys;
  const remaining = points.filter((p) => !searched.has(p.id)).length;
  return {
    state: {
      ...state,
      searchedPoints: searched,
      keys,
      loot: [...state.loot, ...gained],
      phase: remaining === 0 ? 'movement' : 'looting',
      log: [
        ...state.log,
        `搜索【${point.quality.displayName}】${point.requiresKey ? '（消耗铜钥匙）' : ''}：${gained.map((g) => `${g.nm}(${g.value}文)`).join('、')}${remaining === 0 ? '。本房已搜空' : ''}。`,
      ],
    },
    gained,
  };
}

/** 撤离：战利品变现 */
export function extract(state: RunState): RunState {
  const coins = state.loot.reduce((sum, entry) => sum + entry.value, 0);
  return {
    ...state,
    phase: 'finished',
    coins,
    result: 'extracted',
    log: [
      ...state.log,
      `队伍安全撤离！战利品变现 ${coins} 文铜币，军械原样保留。`,
    ],
  };
}

export function lootValue(state: RunState): number {
  return state.loot.reduce((sum, entry) => sum + entry.value, 0);
}

export function normalizeHealth(
  heroHealth: Readonly<Record<number, number>>,
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(heroHealth)) {
    out[Number(key)] = value < 0 ? Number.MAX_SAFE_INTEGER : value;
  }
  return out;
}
