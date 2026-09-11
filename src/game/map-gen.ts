/**
 * 搜索小队专属地图生成（P1-4/P1-5）：
 * - 压缩墓道：6×6=36 房，匹配 5-10 分钟一局
 * - 4 个起始房（中央 2×2），供 4 支玩家小队对称出生
 * - 红蓝成带：对角着色（左上/右下=物理，右上/左下=魔法），
 *   四角 BOSS 继承所在象限色；武者流/法师流各有一条高纯度路线，混合流可穿插
 * - 危险度按离最近起始房的 BFS 距离爬升
 * 不修改 cslg-sdc 拷贝来的 domain 生成器，保持上游可同步。
 */

import {
  seedToRandomState,
  nextRandom,
} from '@/src/domain/combat/random';

export type Nature = 'physical' | 'ghost';
export type RoomKind =
  | 'start'
  | 'combat'
  | 'elite'
  | 'treasure'
  | 'boss'
  | 'merchant';

export interface DemoRoom {
  readonly id: string;
  readonly kind: RoomKind;
  readonly nature: Nature;
  readonly danger: number;
  readonly x: number;
  readonly y: number;
  readonly neighbors: readonly string[];
  readonly displayName: string;
}

export interface DemoMap {
  readonly seed: string;
  readonly columns: number;
  readonly rows: number;
  readonly rooms: readonly DemoRoom[];
}

const COLUMNS = 6;
const ROWS = 6;
const CELL_COUNT = COLUMNS * ROWS;
const START_INDICES = [14, 15, 20, 21]; // 中央 2×2：行2列2、行2列3、行3列2、行3列3
const BOSS_INDICES = [0, 5, 30, 35]; // 四角

const KIND_QUOTAS: Readonly<Record<RoomKind, number>> = {
  start: 4,
  boss: 4,
  merchant: 2,
  treasure: 4,
  elite: 4,
  combat: 18,
};

const ROOM_NAMES: Readonly<Record<RoomKind, readonly string[]>> = {
  start: ['前堂', '侧厅', '甬道口', '下宫门'],
  boss: ['将军主陵', '镇墓殿', '封门祭坛', '魂归之室'],
  merchant: ['灯下摊位', '守陵人窝棚'],
  treasure: ['藏宝耳室', '殉葬坑', '器物架间', '漆匣暗格'],
  elite: ['石俑列阵', '缚灵回廊', '尸傀工坊', '怨煞井底'],
  combat: [
    '墓道', '配殿', '耳房', '券门', '天井', '灶间',
    '井房', '椁室', '享堂', '夹室', '阶下', '沟渠',
    '石桥', '灯房', '碑亭', '窑口', '灰坑', '檐廊',
  ],
};

function rng(seed: string): () => number {
  let state = seedToRandomState(`demo-map:${seed}`);
  return () => {
    const sample = nextRandom(state);
    state = sample.state;
    return sample.value;
  };
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function gridEdges(): string[] {
  const edges: string[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLUMNS; col += 1) {
      const index = row * COLUMNS + col;
      if (col + 1 < COLUMNS) edges.push(edgeKey(index, index + 1));
      if (row + 1 < ROWS) edges.push(edgeKey(index, index + COLUMNS));
    }
  }
  return edges;
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function spanningTree(
  edges: readonly string[],
  rand: () => number,
): ReadonlySet<string> {
  const parent = Array.from({ length: CELL_COUNT }, (_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[x] !== root) {
      const next = parent[x]!;
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const tree = new Set<string>();
  for (const key of shuffled(edges, rand)) {
    const [a, b] = key.split(':').map(Number) as [number, number];
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) continue;
    parent[ra] = rb;
    tree.add(key);
  }
  return tree;
}

function adjacencyOf(edges: ReadonlySet<string>): number[][] {
  const adjacency: number[][] = Array.from(
    { length: CELL_COUNT },
    () => [] as number[],
  );
  for (const key of edges) {
    const [a, b] = key.split(':').map(Number) as [number, number];
    adjacency[a]!.push(b);
    adjacency[b]!.push(a);
  }
  return adjacency;
}

/** 对角着色：左上/右下象限为物理，右上/左下为魔法 */
function natureFor(index: number): Nature {
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const rightHalf = col >= COLUMNS / 2;
  const bottomHalf = row >= ROWS / 2;
  return rightHalf === bottomHalf ? 'ghost' : 'physical';
}

const KIND_LABEL: Readonly<Record<RoomKind, string>> = {
  start: '起点',
  combat: '战斗',
  elite: '精英',
  treasure: '宝藏',
  boss: '首领',
  merchant: '商店',
};

export function generateDemoMap(seed: string): DemoMap {
  const rand = rng(seed);

  // 1. 连通：生成树 + 补边，目标平均分支度 ≈ 2.2
  const allEdges = gridEdges();
  const blocked = new Set<string>();
  for (const corner of BOSS_INDICES) {
    const incident = allEdges.filter((key) => {
      const [a, b] = key.split(':').map(Number);
      return a === corner || b === corner;
    });
    // 每个角只保留一条入口，BOSS 保持尽头房
    const keep = Math.floor(rand() * incident.length);
    incident.forEach((key, i) => {
      if (i !== keep) blocked.add(key);
    });
  }
  const candidates = allEdges.filter((key) => !blocked.has(key));
  const tree = spanningTree(candidates, rand);
  const edges = new Set(tree);
  const target = Math.round(2.2 * CELL_COUNT);
  const spare = shuffled(
    candidates.filter((key) => !tree.has(key)),
    rand,
  );
  for (const key of spare) {
    if (edges.size * 2 >= target) break;
    edges.add(key);
  }

  const adjacency = adjacencyOf(edges);

  // 2. 配额抽签：按危险度从低到高安排房型，宝藏/精英偏中后段
  const remaining: Record<RoomKind, number> = { ...KIND_QUOTAS };
  const kinds: RoomKind[] = Array.from({ length: CELL_COUNT }, () => 'combat');
  for (const index of START_INDICES) {
    kinds[index] = 'start';
    remaining.start -= 1;
  }
  for (const index of BOSS_INDICES) {
    kinds[index] = 'boss';
    remaining.boss -= 1;
  }
  const others = shuffled(
    Array.from({ length: CELL_COUNT }, (_, i) => i).filter(
      (i) => kinds[i] === 'combat',
    ),
    rand,
  );
  const plan: RoomKind[] = [
    ...Array(remaining.merchant).fill('merchant'),
    ...Array(remaining.treasure).fill('treasure'),
    ...Array(remaining.elite).fill('elite'),
    ...Array(remaining.combat).fill('combat'),
  ];
  const layout = shuffled(plan, rand);
  others.forEach((index, i) => {
    kinds[index] = layout[i]!;
  });

  // 3. 危险度：离最近起始房的 BFS 距离 1-7
  const distances = Array.from({ length: CELL_COUNT }, () => -1);
  const queue = [...START_INDICES];
  START_INDICES.forEach((index) => (distances[index] = 0));
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    for (const neighbor of adjacency[current]!) {
      if (distances[neighbor] !== -1) continue;
      distances[neighbor] = distances[current]! + 1;
      queue.push(neighbor);
    }
  }

  // 4. 组装
  const usedNames: Record<RoomKind, string[]> = {
    start: [...ROOM_NAMES.start],
    boss: [...ROOM_NAMES.boss],
    merchant: [...ROOM_NAMES.merchant],
    treasure: [...ROOM_NAMES.treasure],
    elite: [...ROOM_NAMES.elite],
    combat: [...ROOM_NAMES.combat],
  };
  const rooms: DemoRoom[] = kinds.map((kind, index) => {
    const pool = usedNames[kind]!;
    const nameIndex = pool.length > 0 ? index % pool.length : 0;
    const name = pool.splice(nameIndex % Math.max(pool.length, 1), 1)[0] ?? '墓室';
    return {
      id: `r${index}`,
      kind,
      nature: natureFor(index),
      danger: Math.min(7, Math.max(1, distances[index]! + (kind === 'boss' ? 2 : 1))),
      x: index % COLUMNS,
      y: Math.floor(index / COLUMNS),
      neighbors: adjacency[index]!.map((n) => `r${n}`),
      displayName: `${name}·${KIND_LABEL[kind]}`,
    };
  });

  return { seed, columns: COLUMNS, rows: ROWS, rooms };
}
