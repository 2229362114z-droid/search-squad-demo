/* Node 端战斗验证：武者流打物理房应胜，打魔法房应明显吃力 */
import { readFileSync } from 'node:fs';
import { loadGameConfig } from '@/src/config/loader/game-config';
import { runBattle } from '@/src/game/bridge';

async function main(): Promise<void> {
  const config = await loadGameConfigFromFiles();
  const cases: Array<{
    nm: string;
    picks: number[];
    equipped: Record<number, number>;
    room: 'phys' | 'magic' | 'boss';
  }> = [
    {
      nm: '武者流 × 物理房（应胜）',
      picks: [7, 1, 3],
      equipped: { 11: 7, 12: 7, 13: 7, 21: 1, 23: 1, 22: 3, 31: 3 },
      room: 'phys',
    },
    {
      nm: '武者流 × 魔法房（应吃力/败）',
      picks: [7, 1, 3],
      equipped: { 11: 7, 12: 7, 13: 7, 21: 1, 23: 1, 22: 3, 31: 3 },
      room: 'magic',
    },
    {
      nm: '法师流 × 魔法房（应胜）',
      picks: [8, 4, 6],
      equipped: { 11: 8, 12: 8, 13: 8, 31: 4, 32: 4, 33: 6, 21: 6 },
      room: 'magic',
    },
    {
      nm: '混合流 × BOSS房（单将军试炼）',
      picks: [7, 1, 4],
      equipped: { 11: 7, 12: 7, 13: 7, 21: 1, 23: 1, 31: 4, 32: 4 },
      room: 'boss',
    },
  ];
  for (const c of cases) {
    const r = runBattle(config, c.picks, c.equipped, c.room, `seed:${c.nm}`);
    const hp = r.heroHp.map((h) => `${h.nm} ${h.hp}/${h.maxHp}`).join(' | ');
    console.log(
      `${c.nm} => ${r.win ? '胜利' : '失败'} (${r.seconds.toFixed(1)}s)  ${hp}`,
    );
    for (const line of r.lines.slice(-4)) console.log(`   ${line.text}`);
  }
}

/* 从 public/data 读 JSON，绕过 fetch（Node 无静态服务） */
async function loadGameConfigFromFiles() {
  const manifest = JSON.parse(
    readFileSync('public/data/manifest.json', 'utf-8'),
  );
  const schemas: Record<string, unknown> = {};
  const modules: Record<string, unknown> = {};
  for (const descriptor of manifest.modules) {
    schemas[descriptor.id] = JSON.parse(
      readFileSync(`public/data/${descriptor.schema}`, 'utf-8'),
    );
    modules[descriptor.id] = JSON.parse(
      readFileSync(`public/data/${descriptor.path}`, 'utf-8'),
    );
  }
  const { buildGameConfig } = await import('@/src/config/loader/game-config');
  return buildGameConfig(manifest, schemas, modules);
}

void main();
