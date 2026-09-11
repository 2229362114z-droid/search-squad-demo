/**
 * 战斗桥接：把 Demo 的英雄/装备/流派数值映射进《封门将军冢》确定性战斗引擎。
 *
 * 属性映射规则（P0-3）：
 * - 对物理系敌人：有效攻击 = 武力×1.0 + 法力×0.5
 * - 对幽灵系敌人：有效攻击 = 法力×1.0 + 武力×0.5
 *   职业克制由属性本身承载（武者武力高，天然克物理），不再单独乘系数。
 * - 装备错配（武者穿魔法装/法师穿物理装）：该件装备贡献 ×0.4。
 * - 输出装给前排位只发挥一半攻击贡献；防具给输出位只发挥一半承伤贡献。
 */

import type {
  CombatRulesConfig,
  EnemiesConfig,
  GameConfig,
} from '@/src/config/types';
import {
  advanceCombat,
  createCombatState,
  releaseUltimate,
} from '@/src/domain/combat/combat';
import { generateEncounter } from '@/src/domain/combat/encounter';
import type {
  CombatantInput,
  CombatEvent,
  HeroCombatantInput,
} from '@/src/domain/combat/types';
import type { HeroDef, ItemDef, RoomKey } from '@/src/game/data';
import { HEROES, ITEMS } from '@/src/game/data';

const ATTACK_SCALE = 0.5;
const HEALTH_SCALE = 2.6;
const OFF_STAT_RATIO = 0.3;
const MISMATCH_RATIO = 0.4;
const BOSS_DANGER = 5;
const BOSS_HEALTH_FACTOR = 0.45;
const BOSS_ATTACK_FACTOR = 0.6;
const DEMO_COMBAT_DANGER = 3;
const BASE_INTERVAL: Record<'tank' | '武' | '法', number> = {
  tank: 1400,
  武: 900,
  法: 1200,
};

export interface BattleLine {
  readonly atMs: number;
  readonly text: string;
  readonly cls: string;
}

export interface BattleOutcome {
  readonly win: boolean;
  readonly seconds: number;
  readonly lines: readonly BattleLine[];
  readonly heroHp: ReadonlyArray<{
    nm: string;
    hp: number;
    maxHp: number;
    role: string;
  }>;
  readonly enemyHp: ReadonlyArray<{ nm: string; hp: number; maxHp: number }>;
}

export type Role = 'tank' | 'dps';

interface GearTotals {
  wu: number;
  fa: number;
  hpBonus: number;
  dr: number;
  lifesteal: number;
  attackSpeed: number;
  energyRate: number;
  stunBonusMs: number;
}

function gearTotals(
  hero: HeroDef,
  items: readonly ItemDef[],
  role: Role,
): GearTotals {
  const totals: GearTotals = {
    wu: 0,
    fa: 0,
    hpBonus: 0,
    dr: 0,
    lifesteal: 0,
    attackSpeed: 0,
    energyRate: 0,
    stunBonusMs: 0,
  };
  for (const item of items) {
    const matched =
      (item.type === '物理装' && hero.cls === '武') ||
      (item.type === '魔法装' && hero.cls === '法') ||
      item.type === '防具';
    const factor = matched ? 1 : MISMATCH_RATIO;
    const damageFactor = role === 'tank' ? 0.5 : 1;
    if (item.p) totals.wu += item.p * factor * damageFactor;
    if (item.m) totals.fa += item.m * factor * damageFactor;
    if (item.t)
      totals.hpBonus += item.t * (role === 'tank' ? 1 : 0.5);
    if (item.dr && role === 'tank') totals.dr += item.dr * factor;
    if (item.ls) totals.lifesteal += item.ls * factor * damageFactor;
    if (item.as) totals.attackSpeed += item.as * factor * damageFactor;
    if (item.erg) totals.energyRate += item.erg * factor * damageFactor;
    if (item.stun) totals.stunBonusMs += matched ? item.stun : 0;
  }
  return totals;
}

export function heroCombatInput(
  hero: HeroDef,
  items: readonly ItemDef[],
  role: Role,
  roomNature: 'physical' | 'ghost',
  slot: number,
): HeroCombatantInput {
  const gear = gearTotals(hero, items, role);
  const wuTotal = hero.wu + gear.wu;
  const faTotal = hero.fa + gear.fa;
  const power =
    roomNature === 'physical'
      ? wuTotal + faTotal * OFF_STAT_RATIO
      : faTotal + wuTotal * OFF_STAT_RATIO;

  const intervalKey: 'tank' | '武' | '法' =
    role === 'tank' ? 'tank' : hero.cls;
  const intervalMs = Math.max(
    300,
    Math.round(BASE_INTERVAL[intervalKey] * (1 - gear.attackSpeed)),
  );

  const ultimate =
    role === 'tank'
      ? {
          type: 'taunt_and_reduce_damage' as const,
          durationMs: 4000,
          aggroMultiplier: 5,
          damageReductionRatio: 0.35,
        }
      : hero.cls === '武'
        ? {
            type: 'highest_threat_barrage' as const,
            hitCount: 4,
            damageRatioPerHit: 0.9,
          }
        : {
            type: 'all_enemy_damage_and_stun' as const,
            damageRatio: 1.8,
            stunDurationMs: 1600 + gear.stunBonusMs,
          };

  const isTankHero = hero.tank === true;
  return {
    instanceId: `hero:${hero.id}`,
    configId: `demo-hero-${hero.id}`,
    displayName: hero.nm,
    side: 'hero',
    maxHealth: Math.round((hero.hp + gear.hpBonus) * HEALTH_SCALE),
    attack: Math.max(1, Math.round(power * ATTACK_SCALE)),
    attackIntervalMs: intervalMs,
    slot,
    aggroWeight: role === 'tank' ? 3 : 1,
    energyOnAttackHit: role === 'tank' ? 10 : 8,
    energyOnDamageTaken: role === 'tank' ? 7 : 5,
    lifestealRatio: gear.lifesteal,
    stunBonusMs: gear.stunBonusMs,
    ultimate,
    passiveDamageReductionRatio: isTankHero ? (hero.dr ?? 0) + gear.dr : gear.dr,
  };
}

export function buildRoomEnemies(
  seed: string,
  room: RoomKey,
  config: GameConfig,
): readonly CombatantInput[] {
  const rules = config.combatRules as CombatRulesConfig;
  const enemiesConfig = config.enemies as EnemiesConfig;
  if (room === 'boss') {
    // 单将军试炼：nature 由种子决定（红/蓝各半），数值按试玩版折减
    const nature =
      seedToNature(seed) === 0 ? ('physical' as const) : ('ghost' as const);
    const encounter = generateEncounter(
      seed,
      'boss',
      BOSS_DANGER,
      rules,
      enemiesConfig,
      nature,
    );
    return encounter.enemies.map((enemy) => ({
      ...enemy,
      maxHealth: Math.max(1, Math.round(enemy.maxHealth * BOSS_HEALTH_FACTOR)),
      health: Math.max(1, Math.round(enemy.maxHealth * BOSS_HEALTH_FACTOR)),
      attack: Math.max(1, Math.round(enemy.attack * BOSS_ATTACK_FACTOR)),
    }));
  }
  const nature = room === 'phys' ? 'physical' : 'ghost';
  const encounter = generateEncounter(
    seed,
    'combat',
    DEMO_COMBAT_DANGER,
    rules,
    enemiesConfig,
    nature,
  );
  return encounter.enemies;
}

function seedToNature(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2;
}

function eventLine(event: CombatEvent): BattleLine | null {
  switch (event.type) {
    case 'ultimate-released':
      return {
        atMs: event.atMs,
        text: `【${(event.atMs / 1000).toFixed(1)}s】${heroName(event.unitId)} 释放大招`,
        cls: 'win',
      };
    case 'unit-defeated':
      return {
        atMs: event.atMs,
        text: `【${(event.atMs / 1000).toFixed(1)}s】${heroName(event.unitId)} 被击倒`,
        cls: 'lose',
      };
    default:
      return null;
  }
}

const nameById = new Map<string, string>();
function heroName(instanceId: string): string {
  return nameById.get(instanceId) ?? instanceId;
}

export function runBattle(
  config: GameConfig,
  picks: readonly number[],
  equipped: Readonly<Record<number, number>>,
  room: RoomKey,
  seed: string = `demo:${Date.now()}`,
): BattleOutcome {
  const rules = config.combatRules as CombatRulesConfig;
  const roomNature: 'physical' | 'ghost' =
    room === 'magic' ? 'ghost' : 'physical';

  nameById.clear();
  const heroes: HeroCombatantInput[] = [];
  picks.forEach((heroId, index) => {
    const hero = heroById(heroId);
    if (!hero) return;
    const items = itemsForHero(heroId, equipped);
    const role: Role = index === 0 ? 'tank' : 'dps';
    const input = heroCombatInput(hero, items, role, roomNature, index);
    nameById.set(input.instanceId, hero.nm);
    heroes.push(input);
  });

  const enemies = buildRoomEnemies(seed, room, config) as CombatantInput[];
  for (const enemy of enemies) {
    nameById.set(enemy.instanceId, enemy.displayName);
  }

  let state = createCombatState(seed, rules, [...heroes, ...enemies]);
  const lines: BattleLine[] = [];
  const maximumSteps = Math.ceil(rules.simulationTimeoutMs / rules.fixedStepMs);
  for (let step = 0; step < maximumSteps && state.status === 'running'; step += 1) {
    for (const unit of state.units) {
      if (unit.side !== 'hero' || unit.health <= 0) continue;
      if (unit.energy >= rules.maximumEnergy) {
        const released = releaseUltimate(state, rules, unit.instanceId);
        state = released.state;
        for (const event of released.events) {
          const line = eventLine(event);
          if (line) lines.push(line);
        }
        if (state.status !== 'running') break;
      }
    }
    if (state.status !== 'running') break;
    const advanced = advanceCombat(state, rules, rules.fixedStepMs);
    state = advanced.state;
    for (const event of advanced.events) {
      const line = eventLine(event);
      if (line) lines.push(line);
    }
  }

  const win = state.status === 'victory';
  lines.push({
    atMs: state.elapsedMs,
    text: win
      ? `★ 战斗胜利（${(state.elapsedMs / 1000).toFixed(1)}秒）— 战利品已入背包`
      : '✖ 全队倒下 — 物资遗失，本次探索失败',
    cls: win ? 'win' : 'lose',
  });

  return {
    win,
    seconds: state.elapsedMs / 1000,
    lines,
    heroHp: state.units
      .filter((unit) => unit.side === 'hero')
      .map((unit) => ({
        nm: heroName(unit.instanceId),
        hp: unit.health,
        maxHp: unit.maxHealth,
        role: unit.aggroWeight >= 3 ? '前排' : '输出',
      })),
    enemyHp: state.units
      .filter((unit) => unit.side === 'enemy')
      .map((unit) => ({
        nm: heroName(unit.instanceId),
        hp: unit.health,
        maxHp: unit.maxHealth,
      })),
  };
}

function heroById(id: number): HeroDef | undefined {
  return HEROES.find((hero) => hero.id === id);
}

function itemsForHero(
  heroId: number,
  equipped: Readonly<Record<number, number>>,
): readonly ItemDef[] {
  return ITEMS.filter((item) => equipped[item.id] === heroId);
}
