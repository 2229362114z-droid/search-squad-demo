/** 公网版美术资源路径与切图（来源：cslg-sdc public/assets/art） */

const BASE = import.meta.env.BASE_URL;
const ART = `${BASE}assets/art/_internal_dd`;
const ATLAS = `${BASE}assets/art/items/valuables-atlas.png`;

/** 战利品雪碧图：8 格，cell 0-7（与 cslg-sdc art-paths 的 valuableArtCells 一致） */
const VALUABLE_CELLS: Readonly<Record<string, number>> = {
  valuable_old_copper_coin: 0,
  valuable_burial_ceramic: 1,
  valuable_ancient_coin_string: 2,
  valuable_cracked_jade_ornament: 3,
  valuable_ink_rubbing: 4,
  valuable_silver_funeral_pin: 5,
  valuable_general_seal_fragment: 6,
  valuable_jade_cicada: 7,
};

const ATLAS_CELL_PCT = 100 / 8;

export interface IconSpec {
  readonly kind: 'file' | 'atlas';
  readonly src: string;
  readonly cell?: number;
}

export function rewardIcon(artId: string): IconSpec {
  const cell = VALUABLE_CELLS[artId];
  if (cell !== undefined) return { kind: 'atlas', src: ATLAS, cell };
  return { kind: 'file', src: `${ART}/items/${artId}.png` };
}

/** 图标 HTML：atlas 用 background-position 切图 */
export function iconHtml(
  spec: IconSpec,
  size = 44,
): string {
  if (spec.kind === 'atlas') {
    const cell = spec.cell ?? 0;
    return `<span style="display:inline-block;width:${size}px;height:${size}px;background-image:url('${spec.src}');background-size:${size * 8}px ${size}px;background-position:-${cell * size}px 0;image-rendering:auto;border-radius:4px"></span>`;
  }
  return `<img src="${spec.src}" style="width:${size}px;height:${size}px;object-fit:contain" alt="">`;
}

const NODE_ICON: Readonly<Record<string, string>> = {
  start: 'ui_map_node_start',
  combat: 'ui_map_node_battle',
  elite: 'ui_map_node_elite',
  treasure: 'ui_map_node_treasure',
  boss: 'ui_map_node_boss',
  merchant: 'ui_map_node_merchant',
};

export function nodeIcon(kind: string, known: boolean): string {
  if (!known) return `${ART}/map/ui_map_node_unknown.png`;
  const file = NODE_ICON[kind] ?? 'ui_map_node_unknown';
  return `${ART}/map/${file}.png`;
}

/** 搜索点图标：按 pointId 稳定挑一种容器，未搜/已搜两态 */
const SEARCH_FURNITURE = [
  'search_wooden_chest',
  'search_bronze_chest',
  'search_archive_cabinet',
  'search_burial_rack',
  'search_coffin_sidebox',
] as const;

export function searchIcon(pointId: string, searched: boolean): string {
  let hash = 2166136261;
  for (let i = 0; i < pointId.length; i += 1) {
    hash ^= pointId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const base = SEARCH_FURNITURE[hash % SEARCH_FURNITURE.length];
  return `${ART}/search/${base}_${searched ? 'searched' : 'closed'}.png`;
}

/** 房间背景（far 层）按房型取 */
const BG_BY_KIND: Readonly<Record<string, string>> = {
  start: 'tomb_start',
  boss: 'tomb_boss',
  elite: 'tomb_elite',
  treasure: 'tomb_treasure_a',
  merchant: 'tomb_merchant',
};

export function roomBackground(roomId: string, kind: string): string {
  const fixed = BG_BY_KIND[kind];
  if (fixed) {
    if (kind === 'merchant')
      return `${BASE}assets/art/candidates/backgrounds/tomb_merchant_far.png`;
    return `${ART}/backgrounds/${fixed}_far.webp`;
  }
  let hash = 2166136261;
  for (let i = 0; i < roomId.length; i += 1) {
    hash ^= roomId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const variant = 'abcd'[hash % 4] ?? 'a';
  return `${ART}/backgrounds/tomb_battle_${variant}_far.webp`;
}
