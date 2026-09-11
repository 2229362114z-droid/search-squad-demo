# -*- coding: utf-8 -*-
"""One-shot patcher: inject exploration UI into main.ts."""
import io

p = 'src/main.ts'
s = io.open(p, encoding='utf-8').read()

old_imports = '''import {
  HEROES,
  ITEMS,
  ROOM_DEFS,
  type HeroDef,
  type RoomKey,
} from '@/src/game/data';'''
new_imports = '''import {
  HEROES,
  ITEMS,
  ROOM_DEFS,
  type HeroDef,
  type RoomKey,
} from '@/src/game/data';
import {
  createRun,
  neighborsOf,
  fightRoom,
  searchRoom,
  extract,
  type RunState,
} from '@/src/game/run';'''
assert old_imports in s
s = s.replace(old_imports, new_imports)

old_state = '''let equipped: Record<number, number> = {};
let config: GameConfig | null = null;'''
new_state = '''let equipped: Record<number, number> = {};
let config: GameConfig | null = null;
let run: RunState | null = null;'''
assert old_state in s
s = s.replace(old_state, new_state)

old_fight = s[s.index('function fight(): void {'):s.index('/* ============ 启动 ============ */')]
new_fight = '''function fight(): void {
  if (!config) return;
  const outcome = runBattle(config, picks, equipped, roomKey);
  showBattle(
    outcome,
    `对阵：${ROOM_DEFS[roomKey].nm} · 阵容：${verdict().txt} · 引擎：确定性固定步长模拟`,
  );
}

function showBattle(
  outcome: {
    readonly lines: readonly { atMs: number; text: string; cls: string }[];
    readonly heroHp: readonly { nm: string; hp: number; maxHp: number; role: string }[];
    readonly enemyHp: readonly { nm: string; hp: number; maxHp: number }[];
  },
  sub: string,
): void {
  const logEl = $('log');
  const allyEl = $('allyHp');
  const enemyEl = $('enemyHp');
  const subEl = $('battleSub');
  if (!logEl || !allyEl || !enemyEl || !subEl) return;
  logEl.innerHTML = outcome.lines
    .map((l) => `<span class="${l.cls}">${l.text}</span>`)
    .join('<br>');
  allyEl.innerHTML = outcome.heroHp
    .map(
      (a) =>
        `<div class="hpchip">${a.nm} <span style="color:var(--dim)">${a.role}</span><div class="hpbar"><i style="width:${(a.hp / a.maxHp) * 100}%"></i></div></div>`,
    )
    .join('');
  enemyEl.innerHTML = outcome.enemyHp
    .map(
      (e) =>
        `<div class="hpchip">${e.nm}<div class="hpbar"><i style="width:${(e.hp / e.maxHp) * 100}%;background:var(--bad)"></i></div></div>`,
    )
    .join('');
  subEl.textContent = sub;
  const battleEl = $('battle');
  if (battleEl) battleEl.style.display = 'block';
}

/* ============ 探索运行时 UI ============ */
const NATURE_COLOR: Record<string, string> = {
  physical: 'var(--phys)',
  ghost: 'var(--magic)',
};
const KIND_ICON: Record<string, string> = {
  start: '🚪',
  combat: '⚔',
  elite: '💠',
  treasure: '💰',
  boss: '👑',
  merchant: '🛒',
};

function renderExplore(): void {
  if (!run) return;
  const current = run.map.rooms.find((r) => r.id === run!.currentRoomId)!;
  const neighbors = neighborsOf(run);

  const exploreEl = $('explorePanel');
  const seedEl = $('runSeed');
  const coinsEl = $('runCoins');
  const lootEl = $('runLoot');
  const logEl = $('runLog');
  const extractBtn = $('extractBtn') as HTMLButtonElement;
  const searchBtn = $('searchBtn') as HTMLButtonElement;
  const gridEl = $('mapGrid');
  const titleEl = $('roomTitle');
  const listEl = $('neighborList');
  if (!exploreEl || !seedEl || !coinsEl || !lootEl || !logEl || !extractBtn || !searchBtn || !gridEl || !titleEl || !listEl) return;

  exploreEl.style.display = 'block';
  seedEl.textContent = run.seed;
  coinsEl.textContent = String(run.coins);
  lootEl.innerHTML =
    run.loot.length === 0
      ? '<span style="color:var(--dim)">背包空空如也</span>'
      : run.loot
          .map((g) => `${g.nm} <span style="color:var(--gold)">${g.value}文</span>`)
          .join(' · ') +
        `　合计 <b style="color:var(--gold)">${run.loot.reduce((sum, g) => sum + g.value, 0)} 文</b>`;
  logEl.innerHTML = run.log.map((l) => `· ${l}`).join('<br>');

  const canExtract =
    current.kind === 'start' ||
    current.kind === 'merchant' ||
    (current.kind === 'boss' &&
      run.visitedRooms.has(current.id) &&
      run.phase === 'movement');
  extractBtn.disabled = !canExtract;
  extractBtn.textContent = canExtract
    ? `在此撤离（${current.displayName}）`
    : '撤离点：起点 / 商店 / 已清理的BOSS房';

  const searchable = run.phase === 'looting';
  searchBtn.style.display = searchable ? 'inline-block' : 'none';

  const tiles: string[] = [];
  for (const room of run.map.rooms) {
    const isCurrent = room.id === run.currentRoomId;
    const isNeighbor = neighbors.some((n) => n.id === room.id);
    const visited = run.visitedRooms.has(room.id);
    const cls = [
      'tile',
      isCurrent ? 'cur' : '',
      isNeighbor ? 'nbr' : '',
      visited ? 'vis' : '',
      room.nature === 'physical' ? 'red' : 'blue',
    ].join(' ');
    const known = visited || isNeighbor;
    tiles.push(
      `<div class="${cls}" title="${room.displayName} 危险度${room.danger}">${known ? KIND_ICON[room.kind]! : '?'}<small>${known ? room.danger : ''}</small></div>`,
    );
  }
  gridEl.innerHTML = tiles.join('');
  gridEl.style.gridTemplateColumns = `repeat(${run.map.columns}, 46px)`;

  titleEl.innerHTML = `当前：<b style="color:${NATURE_COLOR[current.nature]!}">${current.displayName}</b>（${current.nature === 'physical' ? '红·物理' : '蓝·魔法'} · 危险度 ${current.danger}）`;
  listEl.innerHTML = neighbors
    .map((n) => {
      const known = run!.visitedRooms.has(n.id);
      return `<button class="nbr-btn" onclick="window.__moveTo('${n.id}')">
        <span style="color:${NATURE_COLOR[n.nature]!}">${KIND_ICON[n.kind]!}</span>
        ${known ? n.displayName : '未知区域'}
        <small>危险度 ${n.danger} · ${n.nature === 'physical' ? '物理' : '魔法'}系${n.kind === 'boss' ? ' · BOSS' : ''}</small>
      </button>`;
    })
    .join('');
}

window.__moveTo = (roomId: string): void => {
  if (!run || !config || run.phase !== 'movement') return;
  const room = run.map.rooms.find((r) => r.id === roomId);
  if (!room || !room.neighbors.includes(run.currentRoomId)) return;

  if (room.kind === 'combat' || room.kind === 'elite' || room.kind === 'boss') {
    const { state, outcome } = fightRoom(config, run, picks, {
      roomId,
      nature: room.nature,
      danger: room.danger,
      isBoss: room.kind === 'boss',
    });
    run = state;
    renderExplore();
    showBattle(
      outcome,
      `对阵：${room.displayName}（${room.nature === 'physical' ? '红·物理' : '蓝·魔法'} · 危险度 ${room.danger}）`,
    );
    return;
  }

  const visited = new Set(run.visitedRooms);
  visited.add(roomId);
  const looted = new Set(run.lootedRooms);
  let phase: RunState['phase'] = 'movement';
  const log = [...run.log];
  if (room.kind === 'treasure' && !looted.has(roomId)) {
    phase = 'looting';
    log.push(`抵达【${room.displayName}】，宝箱未启，可以搜刮。`);
  } else {
    log.push(`经过【${room.displayName}】。`);
  }
  run = {
    ...run,
    currentRoomId: roomId,
    visitedRooms: visited,
    lootedRooms: looted,
    phase,
    log,
  };
  renderExplore();
};

window.__search = (): void => {
  if (!run) return;
  const { state } = searchRoom(run, run.currentRoomId);
  run = state;
  renderExplore();
};

window.__extract = (): void => {
  if (!run) return;
  run = extract(run);
  renderExplore();
};

window.__startRun = (): void => {
  if (picks.length < 3 || !config) return;
  run = createRun(`run-${Date.now()}`, { ...equipped }, picks);
  const setup = $('setupView');
  if (setup) setup.style.display = 'none';
  renderExplore();
};

window.__backToSetup = (): void => {
  const setup = $('setupView');
  const explore = $('explorePanel');
  if (setup) setup.style.display = 'block';
  if (explore) explore.style.display = 'none';
  run = null;
};

'''
s = s.replace(old_fight, new_fight)

# window declarations
old_decl = "    __closeBattle: () => void;"
new_decl = """    __closeBattle: () => void;
    __moveTo: (roomId: string) => void;
    __search: () => void;
    __extract: () => void;
    __startRun: () => void;
    __backToSetup: () => void;"""
assert old_decl in s
s = s.replace(old_decl, new_decl)

# mount: wrap setup view + add explore view
old_mount = "  document.getElementById('root')!.innerHTML = `\n<h1>搜索小队 · 策略搜打撤</h1>"
new_mount = "  document.getElementById('root')!.innerHTML = `\n<div id=\"setupView\">\n<h1>搜索小队 · 策略搜打撤</h1>"
assert old_mount in s
s = s.replace(old_mount, new_mount)

old_setup_end = """      <button class="btn-main" id="goBattle" disabled>阵容未成型</button>
    </div>
  </div>
</div>
<div id="battle">"""
new_setup_end = """      <button class="btn-main" id="goBattle" disabled>阵容未成型</button>
      <button class="btn-main" id="startRun" style="margin-top:8px;background:linear-gradient(135deg,#4a6a3a,#7a9a5a)">带此阵容进入墓道 →</button>
    </div>
  </div>
</div>
</div>
<div id="explorePanel" style="display:none">
  <div class="panel" style="margin-bottom:14px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
    <button class="flow-btn" onclick="window.__backToSetup()">← 返回配装</button>
    <b style="color:var(--gold)">墓道探索</b>
    <span>局号 <span id="runSeed" style="color:var(--dim)"></span></span>
    <span>铜币 <b id="runCoins" style="color:var(--gold)">0</b> 文</span>
  </div>
  <div class="layout">
    <div>
      <div class="panel">
        <h2>墓穴地图（点击相邻房间移动 · 红=物理系 蓝=魔法系）</h2>
        <div id="mapGrid" style="display:grid;gap:6px;margin:10px 0"></div>
        <style>
          .tile{width:46px;height:46px;border:1px solid var(--line);border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:18px;background:#1a1611;color:var(--dim)}
          .tile small{font-size:9px;color:var(--dim)}
          .tile.red{border-color:rgba(208,90,78,.35)}
          .tile.blue{border-color:rgba(90,143,208,.35)}
          .tile.vis{opacity:.55}
          .tile.nbr{border-color:var(--gold);cursor:pointer;opacity:1}
          .tile.nbr:hover{background:#2a231c}
          .tile.cur{border-color:var(--ok);background:#232a1c;opacity:1}
          .nbr-btn{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--line);color:var(--text);padding:8px 12px;border-radius:6px;cursor:pointer;font-size:13px;margin-top:6px}
          .nbr-btn:hover{border-color:var(--gold)}
          .nbr-btn small{color:var(--dim);margin-left:auto}
        </style>
      </div>
      <div class="panel" style="margin-top:14px">
        <h2 id="roomTitle"></h2>
        <div id="neighborList"></div>
        <button class="btn-main" id="searchBtn" style="display:none;background:linear-gradient(135deg,#4a6a3a,#7a9a5a)" onclick="window.__search()">搜刮当前房间</button>
        <button class="btn-main" id="extractBtn" style="margin-top:8px" onclick="window.__extract()">撤离</button>
      </div>
    </div>
    <div>
      <div class="panel">
        <h2>背包 · 战利品（撤离变现）</h2>
        <div class="hint" id="runLoot"></div>
      </div>
      <div class="panel" style="margin-top:14px">
        <h2>探索日志</h2>
        <div class="log" id="runLog" style="max-height:260px"></div>
      </div>
    </div>
  </div>
</div>
<div id="battle">"""
assert old_setup_end in s
s = s.replace(old_setup_end, new_setup_end)

old_boot = "  $('goBattle').onclick = fight;"
new_boot = "  $('goBattle').onclick = fight;\n  $('startRun').onclick = () => window.__startRun();"
assert old_boot in s
s = s.replace(old_boot, new_boot)

io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
