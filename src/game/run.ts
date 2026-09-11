/**
 * 探索运行时（P1-7/P1-8 单队版）：
 * 状态机：movement（探图）→ combat（战斗结算）→ looting（搜刮）→ extraction（撤离结算）
 * 搜刮点/奖励用 seed 确定性生成（沿用 domain/search 思路），战利品按价值入包，
 * 撤离时战利品变现铜币，军械保留；全灭则战利品清空、军械保留、带伤回城。
 */

import type { GameConfig } from '@/src/config/types';
import type { DemoMap, DemoRoom, Nature } from '@/src/game/map-gen';
import { generateDemoMap } from '@/src/game/map-gen';
import { runBattle, type BattleOutcome } from '@/src/game/bridge';
import type { ItemDef, RoomKey } from '@/src/game/data';

export type RunPhase = 'movement' | 'looting' | 'finished';

export interface LootEntry {
  readonly instanceId: string;
  readonly nm: string;
  readonly value: number;
}

export interface RunState {
  readonly seed: string;
  readonly map: DemoMap;
  readonly currentRoomId: string;
  readonly phase: RunPhase;
  readonly visitedRooms: ReadonlySet<string>;
  readonly lootedRooms: ReadonlySet<string>;
  /** 军械永久保留（id → 英雄id），战利品撤离变现 */
  readonly equipped: Readonly<Record<number, number>>;
  readonly loot: readonly LootEntry[];
  readonly heroHealth: Readonly<Record<number, number>>;
  readonly coins: number;
  readonly result: 'none' | 'extracted' | 'wiped';
  readonly log: readonly string[];
}

export function createRun(
  seed: string,
  equipped: Readonly<Record<number, number>>,
  picks: readonly number[],
): RunState {
  const map = generateDemoMap(seed);
  // 起始房按队伍序号分配（单队先占 index 0），出生满状态
  const startRoom = map.rooms.find((r) => r.kind === 'start')!;
  const heroHealth: Record<number, number> = {};
  for (const id of picks) heroHealth[id] = -1; // -1 = 满血标记
  return {
    seed,
    map,
    currentRoomId: startRoom.id,
    phase: 'movement',
    visitedRooms: new Set([startRoom.id]),
    lootedRooms: new Set(),
    equipped,
    loot: [],
    heroHealth,
    coins: 0,
    result: 'none',
    log: [`小队从【${startRoom.displayName}】进入墓道，恐怖在身后蔓延……`],
  };
}

export interface MovePreview {
  readonly room: DemoRoom;
  readonly encounter: 'combat' | 'elite' | 'boss' | 'treasure' | 'merchant' | 'start';
  readonly nature: Nature;
  readonly danger: number;
  readonly warning: string;
}

export function neighborsOf(state: RunState): readonly DemoRoom[] {
  return state.map.rooms.filter((r) =>
    r.neighbors.includes(state.currentRoomId),
  );
}

export function previewMove(state: RunState, room: DemoRoom): MovePreview {
  const labels: Record<RoomKind2, string> = {
    start: '起点',
    combat: '战斗房',
    elite: '精英房',
    boss: '首领房',
    treasure: '宝藏房',
    merchant: '商店房',
  };
  return {
    room,
    encounter: room.kind,
    nature: room.nature,
    danger: room.danger,
    warning:
      room.kind === 'boss'
        ? 'BOSS 之战：建议全队满状态，胜后可从此处撤离'
        : room.kind === 'elite'
          ? '精英房：强度高于普通战斗，奖励也更厚'
          : room.nature === 'physical'
            ? '物理系房间：武者输出吃满克制，法师衰减'
            : '魔法系房间：法师输出吃满克制，武者衰减',
  };
}

type RoomKind2 = DemoRoom['kind'];

const LOOT_POOL: ReadonlyArray<{ nm: string; value: number }> = [
  { nm: '铜钱串', value: 18 },
  { nm: '碎玉璜', value: 26 },
  { nm: '错金铜带钩', value: 34 },
  { nm: '云纹漆盒', value: 42 },
  { nm: '青铜爵', value: 55 },
  { nm: '玉蝉', value: 62 },
  { nm: '金错刀', value: 78 },
  { nm: '殉葬珠串', value: 90 },
  { nm: '将军印', value: 130 },
];

export interface CombatRequest {
  readonly roomId: string;
  readonly nature: 'physical' | 'ghost';
  readonly danger: number;
  readonly isBoss: boolean;
}

export function fightRoom(
  config: GameConfig,
  state: RunState,
  picks: readonly number[],
  request: CombatRequest,
): { state: RunState; outcome: BattleOutcome } {
  const seed = `${state.seed}:${request.roomId}`;
  const outcome = runBattle(config, picks, state.equipped, request, seed, normalizeHealth(state.heroHealth));
  const visited = new Set(state.visitedRooms);
  visited.add(request.roomId);

  const healthOut: Record<number, number> = { ...state.heroHealth };
  for (const [heroId, hp] of Object.entries(outcome.heroHealthOut)) {
    healthOut[Number(heroId)] = hp;
  }

  if (!outcome.win) {
    // 全灭：战利品遗失，军械保留，回起始房带 1 血
    const revived: Record<number, number> = {};
    for (const id of picks) revived[id] = 1;
    return {
      state: {
        ...state,
        phase: 'movement',
        visitedRooms: visited,
        heroHealth: revived,
        loot: [],
        currentRoomId: state.map.rooms.find((r) => r.kind === 'start')!.id,
        result: 'wiped',
        log: [...state.log, `全队在【${roomName(state, request.roomId)}】倒下！战利品遗失，军械保留，伤重撤回起点。`],
      },
      outcome,
    };
  }

  // 战斗胜利后进入搜刮阶段；lootedRooms 只在真正搜刮时标记
  const looted = new Set(state.lootedRooms);

  return {
    state: {
      ...state,
      phase: 'looting',
      visitedRooms: visited,
      lootedRooms: looted,
      heroHealth: healthOut,
      currentRoomId: request.roomId,
      log: [
        ...state.log,
        `战斗胜利（${outcome.seconds.toFixed(1)}秒）：【${roomName(state, request.roomId)}】已清理，可以搜刮。`,
      ],
    },
    outcome,
  };
}

export function searchRoom(
  state: RunState,
  roomId: string,
): { state: RunState; gained: readonly LootEntry[] } {
  if (state.lootedRooms.has(roomId) || state.phase !== 'looting') {
    return { state, gained: [] };
  }
  const room = state.map.rooms.find((r) => r.id === roomId)!;
  const count =
    room.kind === 'boss' ? 4 : room.kind === 'elite' ? 3 : room.kind === 'treasure' ? 3 : 2;
  let hash = 2166136261;
  const key = `${state.seed}:${roomId}:loot`;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const gained: LootEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    hash = Math.imul(hash ^ (i + 1), 16777619) >>> 0;
    const pick = LOOT_POOL[hash % LOOT_POOL.length]!;
    gained.push({
      instanceId: `${roomId}:loot:${i}`,
      nm: pick.nm,
      value: Math.round(pick.value * (1 + (room.danger - 1) * 0.25)),
    });
  }
  return {
    state: {
      ...state,
      phase: 'movement',
      currentRoomId: roomId,
      loot: [...state.loot, ...gained],
      log: [
        ...state.log,
        `搜刮【${roomName(state, roomId)}】：${gained.map((g) => `${g.nm}(${g.value}文)`).join('、')}。`,
      ],
    },
    gained,
  };
}

/** 撤离：战利品按价值全额变现；军械保留；结算后 finished */
export function extract(state: RunState): RunState {
  const coins = state.loot.reduce((sum, entry) => sum + entry.value, 0);
  return {
    ...state,
    phase: 'finished',
    coins,
    result: 'extracted',
    log: [...state.log, `队伍安全撤离！战利品变现 ${coins} 文铜币，军械原样保留，可带入下一局。`],
  };
}

export function normalizeHealth(heroHealth: Readonly<Record<number, number>>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(heroHealth)) {
    out[Number(key)] = value < 0 ? Number.MAX_SAFE_INTEGER : value;
  }
  return out;
}

function roomName(state: RunState, roomId: string): string {
  return state.map.rooms.find((r) => r.id === roomId)?.displayName ?? roomId;
}

export type { RoomKey };
