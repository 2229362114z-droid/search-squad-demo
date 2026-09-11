import './style.css';
import type { GameConfig } from '@/src/config/types';
import { loadGameConfig } from '@/src/config/loader/game-config';
import { runBattle } from '@/src/game/bridge';
import {
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
} from '@/src/game/run';

/* ============ 状态 ============ */
let picks: number[] = [];
let selHero: number | null = null;
let armoryTab = '全部';
let roomKey: RoomKey = 'phys';
let equipped: Record<number, number> = {};
let config: GameConfig | null = null;
let run: RunState | null = null;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

/* ============ 渲染 ============ */
function renderPool(): void {
  $('heroPool').innerHTML = HEROES.map((h) => {
    const on = picks.includes(h.id);
    const slotIdx = picks.indexOf(h.id);
    return `<div class="hero-card ${on ? 'picked' : ''}" onclick="window.__toggleHero(${h.id})">
      <div class="avatar">${h.avatar}</div><div class="nm">${h.nm}</div>
      <span class="tag ${h.cls}">${h.cls}</span>
      <div class="stat">武力 ${h.wu} · 法力 ${h.fa} · 生命 ${h.hp}</div>
      <div class="stat" style="color:#7a8a6a">${h.ult}</div>
      ${on ? `<div class="role-now">${slotIdx === 0 ? '前排' : '输出'}</div>` : ''}
    </div>`;
  }).join('');
}

function heroItems(hid: number) {
  return ITEMS.filter((it) => equipped[it.id] === hid);
}

function renderSlots(): void {
  const mk = (hid: number, i: number) => {
    const h = HEROES.find((x) => x.id === hid)!;
    const gear = heroItems(hid)
      .map(
        (it) =>
          `<div class="g"><span>${it.nm}</span><button onclick="window.__unequip(${it.id})">✕</button></div>`,
      )
      .join('');
    return `<div class="slot${i === 0 ? ' front' : ''}" onclick="window.__selectHero(${hid})">
      <div class="pos">${i === 0 ? '① 前排位' : i === 1 ? '② 输出位' : '③ 输出位'}</div>
      <div class="who">${h.avatar}</div><div class="nm">${h.nm}</div>
      <span class="tag ${h.cls}">${h.cls}</span>
      <div class="gear">${gear || '<div style="color:#5c5245;font-size:11px">未穿装备</div>'}</div>
    </div>`;
  };
  const empty = (i: number) =>
    `<div class="slot${i === 0 ? ' front' : ''}"><div class="pos">${i === 0 ? '① 前排位' : i === 1 ? '② 输出位' : '③ 输出位'}</div><div class="empty">空槽位</div></div>`;
  const cell = (i: number) => (picks[i] != null ? mk(picks[i]!, i) : empty(i));
  $('slots').innerHTML = cell(2) + cell(1) + '<div></div>' + cell(0);
  const eq = ITEMS.filter((it) => equipped[it.id] != null);
  $('gearTotal').innerHTML = `带入军械总价值：<b style="color:var(--gold);font-size:15px">${eq.reduce((s, it) => s + it.val, 0)} 文</b>（已装备 ${eq.length}/${ITEMS.length} 件）· 撤离成功后军械原样保留，可带入下一局`;
}

function renderArmory(): void {
  const TYPE_TAG: Record<string, string> = {
    防具: '<span class="tag tag-t">🛡 防</span>',
    物理装: '<span class="tag tag-w">武</span>',
    魔法装: '<span class="tag tag-f">法</span>',
  };
  const TAB_LBL: Record<string, string> = {
    全部: '全部',
    防具: '🛡 防具',
    物理装: '武 · 物理装',
    魔法装: '法 · 魔法装',
  };
  const tabs = ['全部', '防具', '物理装', '魔法装'];
  $('armoryTabs').innerHTML = tabs
    .map(
      (t) =>
        `<button class="${armoryTab === t ? 'on' : ''}" onclick="window.__setTab('${t}')">${TAB_LBL[t]}</button>`,
    )
    .join('');
  $('armory').innerHTML = ITEMS.filter(
    (it) => armoryTab === '全部' || it.type === armoryTab,
  )
    .map((it) => {
      const used = equipped[it.id] != null;
      const owner = used ? HEROES.find((h) => h.id === equipped[it.id])!.nm : null;
      return `<div class="item ${used ? 'equipped' : ''}" onclick="window.__equip(${it.id})">
      <div class="in">${it.nm} ${TYPE_TAG[it.type]!}</div>
      <div class="eff">${it.eff}</div>
      <div class="eff">价值 <span style="color:var(--gold)">${it.val} 文</span></div>
      ${used ? `<div class="eff" style="color:var(--ok)">已穿：${owner}</div>` : ''}
    </div>`;
    })
    .join('');
  $('armoryHint').innerHTML =
    selHero != null && picks.includes(selHero)
      ? `当前为 <b style="color:var(--gold)">${HEROES.find((h) => h.id === selHero)!.nm}</b> 穿戴装备。战斗采用封门将军冢确定性引擎：仇恨/攻速/大招/吸血全部生效。`
      : '先在上方点选一名英雄，再点装备为其穿上。';
}

function heroPower(hid: number) {
  const h = HEROES.find((x) => x.id === hid)!;
  const role = picks.indexOf(hid) === 0 ? 'tank' : 'dps';
  let p = 0;
  let m = 0;
  let t = 0;
  for (const it of heroItems(hid)) {
    const matched =
      (it.type === '物理装' && h.cls === '武') ||
      (it.type === '魔法装' && h.cls === '法') ||
      it.type === '防具';
    const factor = matched ? 1 : 0.4;
    if (it.type === '防具') {
      t += (it.t ?? 0) * (role === 'tank' ? 1 : 0.5);
      if (it.dr && role === 'tank') t += 40 * it.dr;
    }
    if (it.p != null) p += it.p * factor * (role === 'dps' ? 1 : 0.5);
    if (it.m != null) m += it.m * factor * (role === 'dps' ? 1 : 0.5);
  }
  p += h.wu * (role === 'tank' ? 0.3 : 1);
  m += h.fa * (role === 'tank' ? 0.3 : 1);
  t += h.hp * (role === 'tank' ? 0.9 : 0.2);
  return { p, m, t, hp: h.hp, cls: h.cls, nm: h.nm, role };
}

function verdict() {
  if (picks.length < 3) return { txt: '未成型', cls: 'v-未成型' };
  const ps = picks.map(heroPower);
  const physOut = ps.filter((x) => x.role === 'dps' && x.cls === '武').length;
  const magOut = ps.filter((x) => x.role === 'dps' && x.cls === '法').length;
  if (physOut === 2)
    return {
      txt: '武者流 · 纯物理路线',
      cls: 'v-武者流',
      adv: '对物理生物房全面优势，魔法房建议绕行。',
    };
  if (magOut === 2)
    return {
      txt: '法师流 · 纯魔法路线',
      cls: 'v-法师流',
      adv: '对魔法生物房全面优势，物理房建议绕行。',
    };
  return {
    txt: '混合流 · 全能路线',
    cls: 'v-混合流',
    adv: '双系均可应战但都不极致，靠英雄练度与装备质量抬上限。',
  };
}

function renderVerdict(): void {
  const v = verdict();
  $('verdict').textContent = v.txt;
  $('verdict').className = 'verdict ' + v.cls;
  const ps = picks.map(heroPower);
  const P = ps.reduce((s, x) => s + x.p, 0);
  const M = ps.reduce((s, x) => s + x.m, 0);
  const T = ps.reduce((s, x) => s + x.t, 0);
  const S = P + M + T || 1;
  $('powSum').textContent = `总战力 ${Math.round(P + M + T)}`;
  ($('barP') as HTMLElement).style.width = `${(P / S) * 100}%`;
  ($('barM') as HTMLElement).style.width = `${(M / S) * 100}%`;
  ($('barT') as HTMLElement).style.width = `${(T / S) * 100}%`;
  $('advice').innerHTML =
    (v.adv ?? '需要 3 名英雄才可出发。') +
    '<br>提示：右侧靠前的是 1 号前排位，第一个上阵的英雄自动站前排，想让谁扛线就先选谁。';
  const btn = $('goBattle') as HTMLButtonElement;
  if (picks.length < 3) {
    btn.disabled = true;
    btn.textContent = '阵容未成型';
  } else {
    btn.disabled = false;
    btn.textContent = '出发迎战';
  }
}

function renderRoom(): void {
  document
    .querySelectorAll<HTMLButtonElement>('#roomPick button')
    .forEach((b) => b.classList.toggle('on', b.dataset.room === roomKey));
  $('roomInfo').textContent = ROOM_DEFS[roomKey].desc;
}

function renderAll(): void {
  renderPool();
  renderSlots();
  renderArmory();
  renderVerdict();
  renderRoom();
}

/* ============ 交互（挂 window 供内联 onclick） ============ */
declare global {
  interface Window {
    __toggleHero: (id: number) => void;
    __selectHero: (id: number) => void;
    __equip: (id: number) => void;
    __unequip: (id: number) => void;
    __setTab: (t: string) => void;
    __autoConfig: (flow: string) => void;
    __toggleFlowMenu: (e: Event) => void;
    __closeBattle: () => void;
    __moveTo: (roomId: string) => void;
    __search: () => void;
    __extract: () => void;
    __startRun: () => void;
    __backToSetup: () => void;
  }
}

window.__toggleHero = (id: number): void => {
  const i = picks.indexOf(id);
  if (i >= 0) {
    heroItems(id).forEach((it) => delete equipped[it.id]);
    if (selHero === id) selHero = null;
    picks.splice(i, 1);
  } else if (picks.length < 3) {
    picks.push(id);
    selHero = id;
  }
  renderAll();
};
window.__selectHero = (id: number): void => {
  selHero = id;
  renderAll();
};
window.__setTab = (t: string): void => {
  armoryTab = t;
  renderAll();
};
window.__equip = (id: number): void => {
  if (selHero == null || !picks.includes(selHero)) {
    alert('请先点选一名己方英雄');
    return;
  }
  const it = ITEMS.find((x) => x.id === id)!;
  if (equipped[id] != null) return;
  const hero = HEROES.find((h) => h.id === selHero)!;
  const role = picks.indexOf(selHero) === 0 ? 'tank' : 'dps';
  const mismatch =
    (it.type === '物理装' && hero.cls === '法') ||
    (it.type === '魔法装' && hero.cls === '武');
  if (
    role === 'tank' &&
    it.type !== '防具' &&
    !confirm('该英雄当前是前排定位，穿输出装收益较低，确定？')
  )
    return;
  if (
    mismatch &&
    !confirm('职业与装备错配（效果×0.4），确定穿戴？')
  )
    return;
  equipped[id] = selHero;
  renderAll();
};
window.__unequip = (id: number): void => {
  delete equipped[id];
  renderAll();
};
window.__toggleFlowMenu = (e: Event): void => {
  e.stopPropagation();
  $('flowMenu').classList.toggle('open');
};
document.addEventListener('click', (e) => {
  const menu = $('flowMenu');
  if (
    menu &&
    menu.classList.contains('open') &&
    !(e.target as HTMLElement).closest('.flow-menu-wrap')
  )
    menu.classList.remove('open');
});

/* ============ 一键配置 ============ */
window.__autoConfig = (flow: string): void => {
  const tanks = HEROES.filter((h) => h.tank);
  const defScore = (h: HeroDef) => h.hp * 0.9 + (h.dr ?? 0) * 100;
  let tank: HeroDef;
  if (flow === '武') tank = tanks.find((h) => h.cls === '武')!;
  else if (flow === '法') tank = tanks.find((h) => h.cls === '法')!;
  else tank = [...tanks].sort((a, b) => defScore(b) - defScore(a))[0]!;
  const wus = HEROES.filter((h) => h.cls === '武' && !h.tank).sort(
    (a, b) => b.wu - a.wu,
  );
  const fas = HEROES.filter((h) => h.cls === '法' && !h.tank).sort(
    (a, b) => b.fa - a.fa,
  );
  const team =
    flow === '武'
      ? [tank, wus[0]!, wus[1]!]
      : flow === '法'
        ? [tank, fas[0]!, fas[1]!]
        : [tank, wus[0]!, fas[0]!];
  picks = team.map((h) => h.id);
  selHero = null;
  equipped = {};
  const score = (it: (typeof ITEMS)[number]) =>
    (it.p ?? it.m ?? 0) + (it.as ?? it.erg ?? 0) * 20;
  const dpsWu = team.slice(1).filter((h) => h.cls === '武');
  const dpsFa = team.slice(1).filter((h) => h.cls === '法');
  ITEMS.filter((it) => it.type === '防具').forEach(
    (it) => (equipped[it.id] = team[0]!.id),
  );
  if (dpsWu.length)
    ITEMS.filter((it) => it.type === '物理装')
      .sort((a, b) => score(b) - score(a))
      .forEach((it, i) => (equipped[it.id] = dpsWu[i % dpsWu.length]!.id));
  if (dpsFa.length)
    ITEMS.filter((it) => it.type === '魔法装')
      .sort((a, b) => score(b) - score(a))
      .forEach((it, i) => (equipped[it.id] = dpsFa[i % dpsFa.length]!.id));
  $('flowMenu').classList.remove('open');
  renderAll();
};

/* ============ 战斗 ============ */
window.__closeBattle = (): void => {
  $('battle').style.display = 'none';
};

function fight(): void {
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
  if (!run || !config) return;
  // looting 阶段允许移动：视为放弃剩余搜刮机会（沿用原版"离开房间，未完成的搜索点已放弃"）
  if (run.phase === 'looting') {
    run = { ...run, phase: 'movement', log: [...run.log, '离开房间，未完成的搜索已放弃。'] };
  }
  if (run.phase !== 'movement') return;
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

/* ============ 启动 ============ */
function mountAppShell(): void {
  document.getElementById('root')!.innerHTML = `
<div id="setupView">
<h1>搜索小队 · 策略搜打撤</h1>
<div class="sub">指挥官配置阶段：从英雄池选 3 名英雄（1 前排 + 2 输出），从军械库分配装备，确定流派后出发迎战。战斗由《封门将军冢》确定性引擎驱动。</div>
<div class="layout">
  <div>
    <div class="panel">
      <h2>① 英雄池（点击上阵 / 再点取消）</h2>
      <div class="hero-pool" id="heroPool"></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head">
        <h2>② 出战阵容（左侧为 ③、② 输出位，右侧靠外的是 ① 前排位）</h2>
        <div class="flow-menu-wrap">
          <button class="flow-btn" onclick="window.__toggleFlowMenu(event)">⚡ 一键配置 ▾</button>
          <div class="flow-menu" id="flowMenu">
            <button onclick="window.__autoConfig('武')"><b style="color:var(--phys)">武者流</b><small>石敢当前排 + 双武者 · 纯物理路线</small><small style="color:#7a8a6a">✓ 适合：物理生物房（红）| ✗ 魔法房建议绕行</small></button>
            <button onclick="window.__autoConfig('法')"><b style="color:var(--magic)">法师流</b><small>青璃前排 + 双法师 · 纯魔法路线</small><small style="color:#7a8a6a">✓ 适合：魔法生物房（蓝）| ✗ 物理房建议绕行</small></button>
            <button onclick="window.__autoConfig('混')"><b style="color:var(--gold)">混合流</b><small>最优前排 + 武/法各一 · 全能路线</small><small style="color:#7a8a6a">✓ 适合：任意房间均能应战，BOSS房表现均衡</small></button>
          </div>
        </div>
      </div>
      <div class="slots" id="slots"></div>
      <div class="gear-total" id="gearTotal"></div>
      <div class="hint">前排英雄由防具提供承伤；输出英雄由物理/魔法装备提供伤害。职业与装备错配收益打折：武者穿魔法装、法师穿物理装，装备效果 <b style="color:var(--bad)">×0.4</b>。</div>
    </div>
    <div class="panel" style="margin-top:14px">
      <h2>③ 军械库（选中一名己方英雄后点击装备）</h2>
      <div class="tabs" id="armoryTabs"></div>
      <div class="armory" id="armory"></div>
      <div class="hint" id="armoryHint"></div>
    </div>
  </div>
  <div>
    <div class="panel">
      <h2>流派判定</h2>
      <div class="verdict v-未成型" id="verdict">未成型</div>
      <div class="meter"><div class="lbl"><span>战力构成</span><span id="powSum"></span></div>
        <div class="bar"><i class="p" id="barP" style="width:0"></i><i class="m" id="barM" style="width:0"></i><i class="t" id="barT" style="width:0"></i></div>
        <div class="lbl"><span><span style="color:var(--phys)">■</span> 物理</span><span><span style="color:var(--magic)">■</span> 魔法</span><span><span style="color:var(--tank)">■</span> 承伤</span></div>
      </div>
      <div class="hint" id="advice"></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <h2>选择迎战房间</h2>
      <div class="room-pick" id="roomPick">
        <button data-room="phys" class="on">物理生物房<br><small style="color:var(--dim)">红·实体群</small></button>
        <button data-room="magic">魔法生物房<br><small style="color:var(--dim)">蓝·幽灵群</small></button>
        <button data-room="boss">将军BOSS房<br><small style="color:var(--dim)">双系·高难</small></button>
      </div>
      <div class="hint" id="roomInfo"></div>
      <button class="btn-main" id="goBattle" disabled>阵容未成型</button>
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
<div id="battle">
  <div class="box">
    <h1>战斗模拟</h1>
    <div class="sub" id="battleSub"></div>
    <h2>我方阵容</h2><div class="hprow" id="allyHp"></div>
    <h2>敌方阵容</h2><div class="hprow" id="enemyHp"></div>
    <h2>战斗过程</h2><div class="log" id="log"></div>
    <button class="btn-main" onclick="window.__closeBattle()">返回调整配置</button>
  </div>
</div>`;
  document
    .querySelectorAll<HTMLButtonElement>('#roomPick button')
    .forEach(
      (b) =>
        (b.onclick = () => {
          roomKey = b.dataset.room as RoomKey;
          renderRoom();
        }),
    );
  $('goBattle').onclick = fight;
  $('startRun').onclick = () => window.__startRun();
  renderAll();
}

async function boot(): Promise<void> {
  try {
    config = await loadGameConfig(`${import.meta.env.BASE_URL}data`);
    mountAppShell();
  } catch (error) {
    document.getElementById('root')!.innerHTML =
      `<div class="panel" style="margin:40px auto;max-width:520px"><h2>配置加载失败</h2><div class="hint">${String(error)}</div></div>`;
  }
}

void boot();
