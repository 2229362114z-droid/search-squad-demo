import type {
  EnemyNature,
  PrototypeRoomConfig,
  PrototypeRunConfig,
} from '@/src/config/types';
import { nextRandom, seedToRandomState } from '@/src/domain/combat/random';
import { roomDangerForDistance } from '@/src/domain/map/room-danger';

/**
 * 每局随机生成地图。约束与判定见 docs/MAP_GENERATION_DESIGN.md：
 * 房间落在固定网格上，因此道路长度比例恒定合法；生成器只决定连线、房型、
 * 系别与名称。任何一条硬约束不满足就换一个尝试序号重来，而不是就地修补，
 * 以免修补动作本身破坏已经满足的约束。
 */

type Kind = PrototypeRoomConfig['kind'];

interface Rng {
  next(): number;
  integer(minimum: number, maximum: number): number;
}

function createRng(seed: string): Rng {
  let state = seedToRandomState(seed);
  return {
    next() {
      const sample = nextRandom(state);
      state = sample.state;
      return sample.value;
    },
    integer(minimum, maximum) {
      if (maximum < minimum) throw new Error('随机整数范围无效');
      const sample = nextRandom(state);
      state = sample.state;
      return minimum + Math.floor(sample.value * (maximum - minimum + 1));
    },
  };
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng.integer(0, i);
    const a = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = a;
  }
  return copy;
}

/** 无向边用「较小端:较大端」表示，保证同一条连线只有一种写法。 */
const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

function breadthFirstDistances(
  adjacency: readonly (readonly number[])[],
  from: number,
): readonly number[] {
  const distances = adjacency.map(() => -1);
  distances[from] = 0;
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    for (const neighbor of adjacency[current]!) {
      if (distances[neighbor] !== -1) continue;
      distances[neighbor] = distances[current]! + 1;
      queue.push(neighbor);
    }
  }
  return distances;
}

function adjacencyOf(cellCount: number, edges: ReadonlySet<string>) {
  const adjacency: number[][] = Array.from({ length: cellCount }, () => []);
  for (const key of edges) {
    const [a, b] = key.split(':').map(Number) as [number, number];
    adjacency[a]!.push(b);
    adjacency[b]!.push(a);
  }
  return adjacency;
}

export class MapGenerationError extends Error {}

export function generateRunMap(
  seed: string | number,
  run: PrototypeRunConfig,
): readonly PrototypeRoomConfig[] {
  const rules = run.mapGeneration;
  const { columns, rows } = rules.grid;
  const cellCount = columns * rows;
  const quotas = run.expectedRoomCounts;
  const quotaTotal =
    quotas.start +
    quotas.combat +
    quotas.elite +
    quotas.treasure +
    quotas.boss +
    quotas.merchant;
  if (quotaTotal !== cellCount) {
    throw new MapGenerationError(
      `房间配额合计 ${quotaTotal} 与网格容量 ${cellCount} 不一致`,
    );
  }
  const startIndex = rules.startRow * columns + rules.startColumn;
  const bossIndices = [0, columns - 1, (rows - 1) * columns, cellCount - 1];
  if (quotas.boss !== 4 || new Set(bossIndices).size !== 4) {
    throw new MapGenerationError('地图四角必须各有一间 BOSS 房，共四间');
  }
  if (bossIndices.includes(startIndex)) {
    throw new MapGenerationError('起始房不能占用 BOSS 所在的地图角落');
  }

  // 网格上所有可能的连线，只连上下左右。
  const gridEdges: string[] = [];
  for (let row = 0; row < rows; row += 1)
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      if (column + 1 < columns) gridEdges.push(edgeKey(index, index + 1));
      if (row + 1 < rows) gridEdges.push(edgeKey(index, index + columns));
    }

  for (let attempt = 0; attempt < rules.maximumAttempts; attempt += 1) {
    const rng = createRng(`${seed}:map:${attempt}`);
    const layout = tryLayout(
      rng,
      gridEdges,
      cellCount,
      startIndex,
      bossIndices,
      rules,
    );
    if (!layout) continue;
    const assignment = tryAssignRooms(rng, layout, run);
    if (!assignment) continue;
    return buildRooms(rng, layout, assignment, run);
  }
  throw new MapGenerationError(
    `连续 ${rules.maximumAttempts} 次尝试都没有生成满足约束的地图`,
  );
}

interface Layout {
  readonly edges: ReadonlySet<string>;
  readonly adjacency: readonly (readonly number[])[];
  readonly distances: readonly number[];
  readonly startIndex: number;
  readonly bossIndices: readonly number[];
}

function tryLayout(
  rng: Rng,
  gridEdges: readonly string[],
  cellCount: number,
  startIndex: number,
  bossIndices: readonly number[],
  rules: PrototypeRunConfig['mapGeneration'],
): Layout | null {
  // 先为四角各随机保留一条入口。被排除的边不参与成树或补边，
  // 保证 BOSS 始终是尽头房，同时让其余网格自然生成连通路线。
  const blockedEdges = new Set<string>();
  for (const corner of bossIndices) {
    const incident = gridEdges.filter((key) => {
      const [a, b] = key.split(':').map(Number);
      return a === corner || b === corner;
    });
    const entrance = rng.integer(0, incident.length - 1);
    incident.forEach((key, index) => {
      if (index !== entrance) blockedEdges.add(key);
    });
  }
  // 1. 随机生成成树，保证全图连通且没有孤立房间。
  const parent = Array.from({ length: cellCount }, (_, i) => i);
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
  const order = shuffled(
    gridEdges.filter((key) => !blockedEdges.has(key)),
    rng,
  );
  const edges = new Set<string>();
  const spare: string[] = [];
  for (const key of order) {
    const [a, b] = key.split(':').map(Number) as [number, number];
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      spare.push(key);
      continue;
    }
    parent[ra] = rb;
    edges.add(key);
  }
  if (edges.size !== cellCount - 1) return null;

  // 补边只能缩短路径。树上已离起点过近的 BOSS 不可能靠补边修复。
  const treeDistances = breadthFirstDistances(
    adjacencyOf(cellCount, edges),
    startIndex,
  );
  if (
    bossIndices.some((boss) => treeDistances[boss]! < rules.minimumBossDistance)
  )
    return null;

  // 2. 补连线，把平均分支度抬到目标区间中点。
  const target = Math.round(
    ((rules.averageDegree.minimum + rules.averageDegree.maximum) / 2) *
      cellCount,
  );
  for (const key of spare) {
    if (edges.size * 2 >= target) break;
    edges.add(key);
    const candidateAdjacency = adjacencyOf(cellCount, edges);
    const candidateDistances = breadthFirstDistances(
      candidateAdjacency,
      startIndex,
    );
    // 四角都要有足够纵深；跳过会把首领路线抄得太近的捷径。
    if (
      bossIndices.some(
        (boss) => candidateDistances[boss]! < rules.minimumBossDistance,
      ) ||
      Math.max(...candidateDistances) < rules.minimumFarthestDistance ||
      bossIndices.some((boss) => {
        const fromBoss = breadthFirstDistances(candidateAdjacency, boss);
        return bossIndices.some(
          (other) =>
            other !== boss && fromBoss[other]! < rules.minimumBossSeparation,
        );
      })
    )
      edges.delete(key);
  }
  const averageDegree = (edges.size * 2) / cellCount;
  if (
    averageDegree < rules.averageDegree.minimum ||
    averageDegree > rules.averageDegree.maximum
  )
    return null;

  const adjacency = adjacencyOf(cellCount, edges);
  const distances = breadthFirstDistances(adjacency, startIndex);
  if (distances.some((d) => d === -1)) return null;
  if (Math.max(...distances) < rules.minimumFarthestDistance) return null;
  const startDegree = adjacency[startIndex]!.length;
  if (startDegree < 2 || startDegree > 4) return null;

  return { edges, adjacency, distances, startIndex, bossIndices };
}

interface Assignment {
  readonly kinds: readonly Kind[];
  readonly natures: readonly (EnemyNature | undefined)[];
}

function tryAssignRooms(
  rng: Rng,
  layout: Layout,
  run: PrototypeRunConfig,
): Assignment | null {
  const rules = run.mapGeneration;
  const quotas = run.expectedRoomCounts;
  const { adjacency, distances, startIndex } = layout;
  const cellCount = adjacency.length;
  const kinds: Kind[] = Array.from({ length: cellCount }, () => 'combat');
  kinds[startIndex] = 'start';

  // 位置固定为四角，路线仍随机；距离不合格时整张图重新生成。
  const bosses = layout.bossIndices;
  for (const boss of bosses) {
    if (
      adjacency[boss]!.length !== 1 ||
      distances[boss]! < rules.minimumBossDistance
    )
      return null;
    const fromBoss = breadthFirstDistances(adjacency, boss);
    if (
      bosses.some(
        (other) =>
          other !== boss && fromBoss[other]! < rules.minimumBossSeparation,
      )
    )
      return null;
  }
  for (const index of bosses) kinds[index] = 'boss';

  // 精英房不放在近端，避免开局撞上。
  const remaining = shuffled(
    Array.from({ length: cellCount }, (_, i) => i).filter(
      (i) => kinds[i] === 'combat',
    ),
    rng,
  );
  const eliteCandidates = remaining.filter(
    (i) => distances[i]! >= rules.minimumEliteDistance,
  );
  if (eliteCandidates.length < quotas.elite) return null;
  for (const index of eliteCandidates.slice(0, quotas.elite))
    kinds[index] = 'elite';

  // 宝藏房逐个落位，任何时候都不让宝藏连通块超过上限。
  let placedTreasure = 0;
  for (const index of remaining) {
    if (placedTreasure >= quotas.treasure) break;
    if (kinds[index] !== 'combat') continue;
    kinds[index] = 'treasure';
    if (
      treasureClusterSize(adjacency, kinds, index) >
      run.maximumTreasureClusterSize
    ) {
      kinds[index] = 'combat';
      continue;
    }
    placedTreasure += 1;
  }
  if (placedTreasure !== quotas.treasure) return null;

  // 六间商店按距离分位点散布，不占用起点出口。
  const shops = remaining
    .filter((i) => kinds[i] === 'combat' && !adjacency[startIndex]!.includes(i))
    .sort((a, b) => distances[a]! - distances[b]!);
  if (shops.length < quotas.merchant) return null;
  for (let slot = 0; slot < quotas.merchant; slot++) {
    kinds[shops[Math.floor(((slot + 0.5) * shops.length) / quotas.merchant)]!] =
      'merchant';
  }

  // 系别：BOSS 红蓝各半；普通与精英战斗房两系尽量均分。
  const natures: (EnemyNature | undefined)[] = Array.from(
    { length: cellCount },
    () => undefined,
  );
  const bossOrder = shuffled(bosses, rng);
  bossOrder.forEach((index, position) => {
    natures[index] = position < quotas.boss / 2 ? 'physical' : 'ghost';
  });
  for (const kind of ['elite', 'combat'] as const) {
    const cells = shuffled(
      Array.from({ length: cellCount }, (_, i) => i).filter(
        (i) => kinds[i] === kind,
      ),
      rng,
    );
    const half = Math.floor(cells.length / 2);
    cells.forEach((index, position) => {
      natures[index] = position < half ? 'physical' : 'ghost';
    });
  }
  const count = (kind: Kind, nature: EnemyNature) =>
    kinds.filter((k, i) => k === kind && natures[i] === nature).length;
  if (
    Math.min(count('elite', 'physical'), count('elite', 'ghost')) <
    rules.minimumNatureEliteCount
  )
    return null;
  if (
    Math.abs(count('combat', 'physical') - count('combat', 'ghost')) >
    rules.maximumNatureCombatGap
  )
    return null;

  // 起点的出口只能是普通战斗房或宝藏房，且两种都要有：
  // 开局不会被精英或 BOSS 堵门，同时第一步就有"先打一场还是先搜一间"的选择。
  const exits = adjacency[startIndex]!;
  if (
    exits.some((exit) => kinds[exit] !== 'combat' && kinds[exit] !== 'treasure')
  )
    return null;
  if (!exits.some((exit) => kinds[exit] === 'combat')) return null;
  if (!exits.some((exit) => kinds[exit] === 'treasure')) return null;

  // 每个危险度都要有战斗房，避免出现空档的难度台阶。
  const dangers = new Set(
    kinds
      .map((kind, index) =>
        kind === 'combat' || kind === 'elite'
          ? roomDangerForDistance(kind, distances[index]!, run.dangerRules)
          : null,
      )
      .filter((d): d is number => d !== null),
  );
  for (let danger = 1; danger <= run.dangerRules.maximumDanger; danger += 1)
    if (!dangers.has(danger)) return null;

  return { kinds, natures };
}

function treasureClusterSize(
  adjacency: readonly (readonly number[])[],
  kinds: readonly Kind[],
  from: number,
): number {
  const seen = new Set([from]);
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    for (const neighbor of adjacency[queue[head]!]!) {
      if (kinds[neighbor] !== 'treasure' || seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  return seen.size;
}

function buildRooms(
  rng: Rng,
  layout: Layout,
  assignment: Assignment,
  run: PrototypeRunConfig,
): readonly PrototypeRoomConfig[] {
  const rules = run.mapGeneration;
  const { columns, originX, originY, stepX, stepY } = rules.grid;
  const { kinds, natures } = assignment;
  const namePools = Object.fromEntries(
    (Object.keys(rules.roomNames) as Kind[]).map((kind) => [
      kind,
      shuffled(rules.roomNames[kind], rng),
    ]),
  ) as Record<Kind, string[]>;
  const used: Record<Kind, number> = {
    merchant: 0,
    start: 0,
    combat: 0,
    elite: 0,
    treasure: 0,
    boss: 0,
  };
  const idOf = (index: number) =>
    index === layout.startIndex
      ? run.startRoomId
      : `room_c${String(index % columns).padStart(2, '0')}_r${String(
          Math.floor(index / columns),
        ).padStart(2, '0')}`;
  const round3 = (value: number) => Math.round(value * 1000) / 1000;

  return kinds.map((kind, index) => {
    const nature = natures[index];
    const name = namePools[kind][used[kind]] ?? `${kind}-${index}`;
    used[kind] += 1;
    return {
      id: idOf(index),
      displayName: name,
      kind,
      danger: roomDangerForDistance(
        kind,
        layout.distances[index]!,
        run.dangerRules,
      ),
      x: round3(originX + (index % columns) * stepX),
      y: round3(originY + Math.floor(index / columns) * stepY),
      neighbors: layout.adjacency[index]!.map(idOf).sort(),
      ...(kind === 'combat' || kind === 'elite' || kind === 'boss'
        ? { nature }
        : {}),
    };
  });
}
