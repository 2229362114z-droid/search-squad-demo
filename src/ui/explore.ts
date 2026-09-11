/** 探索界面：公网版美术（节点地图 / 房间背景 / 搜索点 / 物品图标） */

import type { GameConfig } from '@/src/config/types';
import {
  createRun,
  neighborsOf,
  roomOf,
  searchPointsOf,
  moveTo,
  searchPoint,
  extract,
  lootValue,
  type RunState,
  type LootEntry,
} from '@/src/game/run';
import {
  nodeIcon,
  searchIcon,
  rewardIcon,
  iconHtml,
  roomBackground,
} from '@/src/game/art';
import { HEROES } from '@/src/game/data';

let config: GameConfig;
let run: RunState | null = null;
let onBackToSetup: () => void = () => {};

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export function startExplore(
  cfg: GameConfig,
  seed: string,
  equipped: Readonly<Record<number, number>>,
  picks: readonly number[],
  backToSetup: () => void,
): void {
  config = cfg;
  onBackToSetup = backToSetup;
  run = createRun(cfg, seed, equipped, picks);
  const root = $('exploreRoot');
  root.innerHTML = `
  <div style="max-width:1180px;margin:0 auto;padding:14px">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:12px">
      <button id="expBackBtn" style="background:#2a231c;border:1px solid #3d332a;color:#d4a94e;padding:6px 14px;border-radius:6px;cursor:pointer">← 返回配装</button>
      <b style="color:#d4a94e;font-size:17px">墓道探索</b>
      <span style="color:#9b8c74;font-size:12px">局号 ${seed.slice(0, 18)}</span>
      <div style="flex:1"></div>
      <div id="terrorWrap" style="min-width:180px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#9b8c74"><span>恐怖值</span><span id="terrorText"></span></div>
        <div style="height:8px;background:#1a1611;border-radius:4px;overflow:hidden;margin-top:2px"><i id="terrorBar" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#6e3a30,#c33);transition:.3s"></i></div>
      </div>
      <span style="font-size:13px">铜币 <b id="expCoins" style="color:#d4a94e">0</b> 文</span>
      <span style="font-size:13px">背包 <b id="expLootVal" style="color:#d4a94e">0</b> 文</span>
      <span style="font-size:13px">🔑 <b id="expKeys">2</b></span>
    </div>
    <div style="display:grid;grid-template-columns:minmax(340px,1.2fr) minmax(300px,1fr);gap:14px;align-items:start">
      <div style="background:#201b16;border:1px solid #3d332a;border-radius:10px;padding:10px">
        <div style="font-size:12px;color:#9b8c74;margin-bottom:6px">墓穴地图 · 红=物理系 蓝=魔法系 · 点击高亮房间移动</div>
        <div id="mapBox" style="position:relative;width:100%;aspect-ratio:1.5"></div>
      </div>
      <div>
        <div style="position:relative;border-radius:10px;overflow:hidden;border:1px solid #3d332a">
          <img id="roomBg" style="width:100%;display:block;aspect-ratio:16/9;object-fit:cover" alt="">
          <div id="roomTitleOverlay" style="position:absolute;left:0;right:0;bottom:0;padding:8px 12px;background:linear-gradient(transparent,rgba(10,8,6,.92));font-size:14px"></div>
        </div>
        <div id="heroStrip" style="display:flex;gap:6px;margin-top:8px"></div>
        <div style="background:#201b16;border:1px solid #3d332a;border-radius:10px;padding:10px;margin-top:8px">
          <div id="searchArea"></div>
          <div id="moveArea"></div>
          <button id="extractBtn" style="width:100%;margin-top:8px;padding:10px;font-size:14px;background:linear-gradient(135deg,#8a6a2a,#c9a04a);color:#1a1408;border:none;border-radius:8px;cursor:pointer;font-weight:bold">撤离</button>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
      <div style="background:#201b16;border:1px solid #3d332a;border-radius:10px;padding:10px">
        <div style="font-size:13px;color:#d4a94e;margin-bottom:6px">战利品（撤离变现）</div>
        <div id="lootGrid" style="display:flex;flex-wrap:wrap;gap:6px;min-height:48px"></div>
      </div>
      <div style="background:#201b16;border:1px solid #3d332a;border-radius:10px;padding:10px">
        <div style="font-size:13px;color:#d4a94e;margin-bottom:6px">探索日志</div>
        <div id="runLog" style="font-size:12px;line-height:1.9;color:#c9bda5;max-height:180px;overflow:auto"></div>
      </div>
    </div>
  </div>`;
  $('expBackBtn').onclick = () => {
    run = null;
    onBackToSetup();
  };
  $('extractBtn').onclick = () => {
    if (!run || run.result === 'extracted') return;
    run = extract(run);
    render();
  };
  render();
}

function heroMaxHp(heroId: number): number {
  const hero = HEROES.find((h) => h.id === heroId);
  return hero ? hero.hp * 2.6 : 100;
}

function render(): void {
  const state = run;
  if (!state) return;
  const current = roomOf(state);
  const neighbors = neighborsOf(state);

  // 状态条
  $('terrorText').textContent = `${state.terror}/${config.terror.maximum}`;
  ($('terrorBar') as HTMLElement).style.width = `${(state.terror / config.terror.maximum) * 100}%`;
  $('expCoins').textContent = String(state.coins);
  $('expLootVal').textContent = String(lootValue(state));
  $('expKeys').textContent = String(state.keys);
  $('runLog').innerHTML = state.log.map((l) => `· ${l}`).join('<br>');

  // 地图：节点 + SVG 连线
  const box = $('mapBox');
  const W = 100;
  const H = 66.7;
  const cellW = W / state.map.columns;
  const cellH = H / state.map.rows;
  const pos = (x: number, y: number) => ({
    left: (x + 0.5) * cellW,
    top: (y + 0.5) * cellH,
  });
  const lines: string[] = [];
  const drawn = new Set<string>();
  for (const room of state.map.rooms) {
    for (const nId of room.neighbors) {
      const key = room.id < nId ? `${room.id}|${nId}` : `${nId}|${room.id}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const other = state.map.rooms.find((r) => r.id === nId)!;
      const a = pos(room.x, room.y);
      const b = pos(other.x, other.y);
      lines.push(
        `<line x1="${a.left}" y1="${a.top}" x2="${b.left}" y2="${b.top}" stroke="#3d332a" stroke-width="0.6"/>`,
      );
    }
  }
  const nodes = state.map.rooms
    .map((room) => {
      const p = pos(room.x, room.y);
      const isCurrent = room.id === state.currentRoomId;
      const isNeighbor = neighbors.some((n) => n.id === room.id);
      const known = state.visitedRooms.has(room.id) || isNeighbor;
      const ring = isCurrent
        ? 'box-shadow:0 0 0 3px #6fbf73'
        : isNeighbor
          ? 'box-shadow:0 0 0 2.5px #d4a94e;cursor:pointer'
          : 'opacity:.45';
      const natureDot =
        known && room.kind !== 'start' && room.kind !== 'merchant'
          ? `<i style="position:absolute;right:-2px;top:-2px;width:9px;height:9px;border-radius:50%;background:${room.nature === 'physical' ? '#d05a4e' : '#5a8fd0'};border:1.5px solid #15120f"></i>`
          : '';
      const dangerTag = known
        ? `<small style="position:absolute;left:50%;transform:translateX(-50%);bottom:-13px;font-size:8px;color:#9b8c74">危${room.danger}</small>`
        : '';
      return `<div style="position:absolute;left:${p.left}%;top:${p.top}%;transform:translate(-50%,-50%);width:13%;aspect-ratio:1" title="${known ? room.displayName : '未知'}" ${isNeighbor ? `data-move="${room.id}"` : ''}>
        <img src="${nodeIcon(room.kind, known)}" style="width:100%;height:100%;object-fit:contain;${ring};border-radius:50%;background:#1a1611" alt="">
        ${natureDot}${dangerTag}
      </div>`;
    })
    .join('');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;width:100%;height=100%">${lines.join('')}</svg>${nodes}`;
  box
    .querySelectorAll<HTMLElement>('[data-move]')
    .forEach((el) => {
      el.onclick = () => doMove(el.dataset.move!);
    });

  // 房间背景与标题
  ($('roomBg') as HTMLImageElement).src = roomBackground(current.id, current.kind);
  $('roomTitleOverlay').innerHTML = `<b style="color:${current.nature === 'physical' ? '#d05a4e' : '#5a8fd0'}">${current.displayName}</b>　<span style="color:#9b8c74;font-size:12px">${current.nature === 'physical' ? '红·物理' : '蓝·魔法'} · 危险度 ${current.danger}${state.visitedRooms.has(current.id) ? '' : ' · 未探索'}</span>`;

  // 英雄血条
  $('heroStrip').innerHTML = state.picks
    .map((heroId, i) => {
      const hero = HEROES.find((h) => h.id === heroId)!;
      const maxHp = heroMaxHp(heroId);
      const hp = state.heroHealth[heroId] === -1 ? maxHp : (state.heroHealth[heroId] ?? 0);
      const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
      return `<div style="flex:1;background:#1a1611;border:1px solid #3d332a;border-radius:8px;padding:5px 8px">
        <div style="font-size:12px">${i === 0 ? '🛡' : '⚔'} ${hero.nm}</div>
        <div style="height:6px;background:#15120f;border-radius:3px;margin-top:3px;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:${pct > 40 ? '#6fbf73' : '#c33'}"></i></div>
      </div>`;
    })
    .join('');

  // 搜索点
  const points = searchPointsOf(config, state);
  const searchable = state.phase === 'looting';
  $('searchArea').innerHTML =
    points.length === 0
      ? ''
      : `<div style="font-size:12px;color:#9b8c74;margin-bottom:6px">搜索点${searchable ? '（点击搜索）' : ''}</div>
         <div style="display:flex;gap:8px;flex-wrap:wrap">${points
           .map((p) => {
             const locked = p.requiresKey && !p.searched;
             const dim = p.searched ? 'opacity:.4;filter:grayscale(.8)' : searchable ? '' : 'opacity:.6';
             return `<div data-point="${p.id}" style="position:relative;width:64px;text-align:center;cursor:${p.searched || !searchable ? 'default' : 'pointer'};${dim}" title="${p.qualityName}${p.requiresKey ? ' · 需铜钥匙' : ''}">
               <img src="${searchIcon(p.id, p.searched)}" style="width:56px;height:56px;object-fit:contain" alt="">
               ${locked ? '<span style="position:absolute;right:2px;top:2px;font-size:14px">🔒</span>' : ''}
               <div style="font-size:10px;color:${p.qualityColor}">${p.qualityName}</div>
             </div>`;
           })
           .join('')}</div>`;
  $('searchArea')
    .querySelectorAll<HTMLElement>('[data-point]')
    .forEach((el) => {
      el.onclick = () => doSearch(el.dataset.point!);
    });

  // 移动按钮
  $('moveArea').innerHTML = neighbors
    .map((n) => {
      const known = state.visitedRooms.has(n.id);
      return `<button data-move2="${n.id}" style="display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:#2a231c;border:1px solid #3d332a;color:#e8ddc8;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;margin-top:6px">
        <img src="${nodeIcon(n.kind, known)}" style="width:26px;height:26px;object-fit:contain" alt="">
        <span>${known ? n.displayName : '未知区域'} <small style="color:#9b8c74">危${n.danger} · ${n.nature === 'physical' ? '物理' : '魔法'}${n.kind === 'boss' ? ' · BOSS' : ''}</small></span>
      </button>`;
    })
    .join('');
  $('moveArea')
    .querySelectorAll<HTMLElement>('[data-move2]')
    .forEach((el) => {
      el.onclick = () => doMove(el.dataset.move2!);
    });

  // 撤离
  const canExtract =
    state.phase === 'movement' &&
    (current.kind === 'start' ||
      current.kind === 'merchant' ||
      (current.kind === 'boss' && state.visitedRooms.has(current.id)));
  const extractBtn = $('extractBtn') as HTMLButtonElement;
  extractBtn.disabled = !canExtract;
  extractBtn.textContent = state.result === 'extracted'
    ? `✓ 已撤离：变现 ${state.coins} 文`
    : canExtract
      ? `在此撤离（变现 ${lootValue(state)} 文）`
      : '撤离点：起点 / 商店 / 已清理的BOSS房';

  // 战利品
  $('lootGrid').innerHTML =
    state.loot.length === 0
      ? '<span style="color:#5c5245;font-size:12px">空空如也，去搜刮吧</span>'
      : state.loot
          .map(
            (g: LootEntry) =>
              `<div style="display:flex;align-items:center;gap:4px;background:#1a1611;border:1px solid #3d332a;border-radius:6px;padding:3px 6px;font-size:11px">${iconHtml(rewardIcon(g.artId), 26)}${g.nm} <b style="color:#d4a94e">${g.value}文</b></div>`,
          )
          .join('');
}

function doMove(roomId: string): void {
  if (!run) return;
  const { state, outcome } = moveTo(config, run, roomId);
  run = state;
  render();
  if (outcome) showBattleModal(outcome);
}

function doSearch(pointId: string): void {
  if (!run || run.phase !== 'looting') return;
  const { state, gained, error } = searchPoint(config, run, pointId);
  if (error) {
    flash(error === '需要铜钥匙' ? '此搜索点已上锁，需要铜钥匙（商店可购）' : error);
    return;
  }
  run = state;
  render();
  if (gained.length > 0) {
    flash(
      `搜到：${gained.map((g) => `${g.nm}(${g.value}文)`).join('、')}`,
    );
  }
}

function flash(text: string): void {
  const old = document.getElementById('expFlash');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'expFlash';
  el.textContent = text;
  el.style.cssText =
    'position:fixed;top:18px;left:50%;transform:translateX(-50%);background:#2a231c;border:1px solid #d4a94e;color:#e8ddc8;padding:10px 22px;border-radius:8px;z-index:99;font-size:13px;box-shadow:0 4px 20px rgba(0,0,0,.6)';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function showBattleModal(outcome: {
  readonly lines: readonly { atMs: number; text: string; cls: string }[];
  readonly heroHp: readonly { nm: string; hp: number; maxHp: number; role: string }[];
  readonly enemyHp: readonly { nm: string; hp: number; maxHp: number }[];
}): void {
  const old = document.getElementById('expBattle');
  if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'expBattle';
  el.style.cssText =
    'position:fixed;inset:0;background:rgba(10,8,6,.93);z-index:98;overflow:auto;padding:26px';
  const chip = (nm: string, hp: number, maxHp: number, extra = '') =>
    `<div style="background:#201b16;border:1px solid #3d332a;border-radius:8px;padding:8px 12px;min-width:130px"><div style="font-size:13px">${nm} <span style="color:#9b8c74;font-size:11px">${extra}</span></div><div style="height:7px;background:#15120f;border-radius:4px;margin-top:4px;overflow:hidden"><i style="display:block;height:100%;width:${Math.max(0, (hp / maxHp) * 100)}%;background:${hp > 0 ? '#6fbf73' : '#c33'}"></i></div></div>`;
  el.innerHTML = `<div style="max-width:760px;margin:0 auto">
    <h2 style="color:#d4a94e">战斗结算</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">${outcome.heroHp.map((h) => chip(h.nm, h.hp, h.maxHp, h.role)).join('')}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">${outcome.enemyHp.map((h) => chip(h.nm, h.hp, h.maxHp)).join('')}</div>
    <div style="background:#141110;border:1px solid #3d332a;border-radius:8px;padding:12px;font-size:13px;line-height:2;font-family:Consolas,monospace;max-height:300px;overflow:auto">${outcome.lines
      .map((l) => `<span style="color:${l.cls === 'win' ? '#6fbf73' : l.cls === 'lose' ? '#d05a4e' : '#c9bda5'}">${l.text}</span>`)
      .join('<br>')}</div>
    <button id="expBattleClose" style="width:100%;margin-top:12px;padding:11px;font-size:15px;background:linear-gradient(135deg,#8a6a2a,#c9a04a);color:#1a1408;border:none;border-radius:8px;cursor:pointer;font-weight:bold">继续</button>
  </div>`;
  document.body.appendChild(el);
  document.getElementById('expBattleClose')!.onclick = () => el.remove();
}
