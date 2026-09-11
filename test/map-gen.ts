/* 地图生成验证：多 seed 检查连通性、配额、起始房分布、红蓝成带、危险度 */
import { generateDemoMap } from '@/src/game/map-gen';

let failures = 0;
const seeds = ['a', 'b', 'c', 'demo-1', 'xyz', '42', 'player-7', 'run-99'];

for (const seed of seeds) {
  const map = generateDemoMap(seed);
  const { rooms } = map;

  // 1) 连通性：任意房间可达任意起始房
  const startIds = rooms.filter((r) => r.kind === 'start').map((r) => r.id);
  const seen = new Set<string>();
  const queue = [startIds[0]!];
  seen.add(queue[0]!);
  while (queue.length) {
    const id = queue.shift()!;
    const current = rooms.find((r) => r.id === id);
    if (!current) continue;
    for (const n of current.neighbors) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  const connected = seen.size === rooms.length;

  // 2) 配额
  const counts = rooms.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1;
    return acc;
  }, {});
  const quotaOk =
    counts.start === 4 &&
    counts.boss === 4 &&
    counts.merchant === 2 &&
    counts.treasure === 4 &&
    counts.elite === 4 &&
    counts.combat === 18;

  // 3) 起始房全在中央 2×2，BOSS 全在四角
  const startOk = rooms
    .filter((r) => r.kind === 'start')
    .every((r) => r.x >= 2 && r.x <= 3 && r.y >= 2 && r.y <= 3);
  const bossOk = rooms
    .filter((r) => r.kind === 'boss')
    .every((r) => (r.x === 0 || r.x === 5) && (r.y === 0 || r.y === 5));

  // 4) 红蓝成带：对角象限各一色
  const natureOk = rooms.every((r) => {
    const rightHalf = r.x >= 3;
    const bottomHalf = r.y >= 3;
    const expect = rightHalf === bottomHalf ? 'ghost' : 'physical';
    return r.nature === expect;
  });

  // 5) 危险度范围与起始房为 1
  const dangerOk =
    rooms.every((r) => r.danger >= 1 && r.danger <= 7) &&
    rooms.filter((r) => r.kind === 'start').every((r) => r.danger === 1);

  // 6) BOSS 为尽头房（恰好 1 条边）
  const bossDeadEnd = rooms
    .filter((r) => r.kind === 'boss')
    .every((r) => r.neighbors.length === 1);

  const ok =
    connected && quotaOk && startOk && bossOk && natureOk && dangerOk && bossDeadEnd;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} seed=${seed} 连通=${connected} 配额=${JSON.stringify(counts)} 中央起点=${startOk} 四角BOSS=${bossOk} 成带=${natureOk} 危险度=${dangerOk} BOSS尽头=${bossDeadEnd}`,
  );
}

// 打印一张样例地图的可视化
const sample = generateDemoMap('demo-1');
console.log('\n样例地图（P=物理战斗 E=精英 T=宝藏 M=商店 S=起点 B=BOSS；红=physical 蓝=ghost）：');
for (let y = 0; y < sample.rows; y += 1) {
  const row = sample.rooms
    .filter((r) => r.y === y)
    .map(
      (r) =>
        `${r.nature === 'physical' ? '红' : '蓝'}${r.kind[0]!.toUpperCase()}${r.danger}`,
    )
    .join(' ');
  console.log(`  ${row}`);
}
console.log(failures === 0 ? '\n全部通过' : `\n${failures} 个 seed 失败`);
process.exit(failures === 0 ? 0 : 1);
