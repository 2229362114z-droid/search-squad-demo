/* 英雄与军械数据：武力/法力/生命三属性，职业 武|法，装备 防具/物理装/魔法装 */

export interface HeroDef {
  readonly id: number;
  readonly nm: string;
  readonly cls: '武' | '法';
  readonly avatar: string;
  readonly wu: number;
  readonly fa: number;
  readonly hp: number;
  readonly dr?: number;
  readonly tank?: boolean;
  readonly ult: string;
}

export interface ItemDef {
  readonly id: number;
  readonly nm: string;
  readonly type: '防具' | '物理装' | '魔法装';
  readonly eff: string;
  readonly t?: number;
  readonly dr?: number;
  readonly p?: number;
  readonly m?: number;
  readonly as?: number;
  readonly ls?: number;
  readonly erg?: number;
  readonly stun?: number;
  readonly val: number;
}

function face(
  id: number,
  skin: string,
  hair2: string,
  extra: { armor: string; hairStyle: string; deco?: string },
): string {
  return `<svg viewBox="0 0 100 100" width="100%" style="max-width:64px;display:block">
    <defs><clipPath id="cf${id}"><circle cx="50" cy="50" r="46"/></clipPath></defs>
    <circle cx="50" cy="50" r="46" fill="#2a231c" stroke="#3d332a" stroke-width="2"/>
    <g clip-path="url(#cf${id})">
      <ellipse cx="50" cy="118" rx="42" ry="40" fill="${hair2}"/>
      <rect x="40" y="66" width="20" height="16" fill="${skin}"/>
      <path d="M18 100 Q50 74 82 100 Z" fill="${extra.armor}"/>
      <ellipse cx="50" cy="44" rx="22" ry="25" fill="${skin}"/>
      ${extra.hairStyle}
      <path d="M36 42 q5 -4 11 0" stroke="#2a1f16" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M53 42 q5 -4 11 0" stroke="#2a1f16" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="41.5" cy="49" rx="3" ry="3.6" fill="#1c130c"/><ellipse cx="58.5" cy="49" rx="3" ry="3.6" fill="#1c130c"/>
      <circle cx="42.6" cy="47.9" r="1" fill="#fff"/><circle cx="59.6" cy="47.9" r="1" fill="#fff"/>
      <path d="M50 52 q-2 5 1 7" stroke="${skin}" stroke-width="2" fill="none" opacity="0.6"/>
      <path d="M45 63 q5 3 10 0" stroke="#6b3a30" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      ${extra.deco ?? ''}
    </g>
  </svg>`;
}

const AVATARS: Record<number, string> = {
  7: face(7, '#c9a074', '#4a4038', {
    armor: '#5a6a4a',
    hairStyle: `<path d="M28 40 q0 -20 22 -20 q22 0 22 20 l-4 -6 q-8 -8 -18 -8 q-10 0 -18 8 Z" fill="#3c342c"/><rect x="26" y="36" width="48" height="6" rx="3" fill="#6a7a58"/>`,
    deco: `<path d="M43 63 h14" stroke="#6b3a30" stroke-width="2.6" stroke-linecap="round"/>`,
  }),
  8: face(8, '#e8cba8', '#46507a', {
    armor: '#4a5a7a',
    hairStyle: `<path d="M28 40 q0 -22 22 -22 q22 0 22 22 l-4 -8 q-8 -8 -18 -8 q-10 0 -18 8 Z" fill="#384058"/><path d="M26 40 q-2 20 5 30 l6 -4 q-6 -12 -4 -26 z" fill="#384058"/><path d="M74 40 q2 20 -5 30 l-6 -4 q6 -12 4 -26 z" fill="#384058"/>`,
    deco: `<circle cx="50" cy="30" r="3" fill="#7ab0d0"/>`,
  }),
  1: face(1, '#d9a878', '#5a4234', {
    armor: '#7a4a3a',
    hairStyle: `<path d="M28 40 q0 -22 22 -22 q22 0 22 22 l-4 -8 q-6 -8 -18 -8 q-12 0 -18 8 Z" fill="#4a3428"/>`,
    deco: `<path d="M30 34 q20 -8 40 0" stroke="#8a2f28" stroke-width="4" fill="none"/><circle cx="30" cy="34" r="2.4" fill="#8a2f28"/>`,
  }),
  2: face(2, '#c98f62', '#332e2a', {
    armor: '#4a4a52',
    hairStyle: `<path d="M28 42 q2 -24 22 -24 q20 0 22 24 l-3 -6 q-8 -10 -19 -10 q-11 0 -19 10 Z" fill="#23201e"/><path d="M27 42 l-3 14 l6 2 z" fill="#23201e"/>`,
    deco: `<path d="M60 36 l10 6 M62 33 l10 6" stroke="#9aa0aa" stroke-width="2.2"/>`,
  }),
  3: face(3, '#e8b98c', '#6e3a30', {
    armor: '#a0524a',
    hairStyle: `<path d="M27 38 q4 -20 23 -20 q19 0 23 20 l-6 -4 q-8 -6 -17 -6 q-9 0 -17 6 Z" fill="#5a2f28"/><circle cx="72" cy="46" r="7" fill="#5a2f28"/>`,
    deco: `<circle cx="50" cy="30" r="3" fill="#d4a94e"/>`,
  }),
  4: face(4, '#e3c39a', '#3a4460', {
    armor: '#3f5a8a',
    hairStyle: `<path d="M28 40 q0 -22 22 -22 q22 0 22 22 q-6 -12 -22 -12 q-16 0 -22 12 Z" fill="#2c3448"/>`,
    deco: `<path d="M68 40 l6 -12 l3 2 l-5 11 z" fill="#d4a94e"/>`,
  }),
  5: face(5, '#ecd0b0', '#6e5640', {
    armor: '#6a7a58',
    hairStyle: `<ellipse cx="50" cy="32" rx="24" ry="16" fill="#5c4632"/><path d="M26 36 q24 14 48 0 l0 8 q-24 12 -48 0 Z" fill="#5c4632"/>`,
    deco: `<path d="M41 57 q9 6 18 0" stroke="#8a5a3a" stroke-width="2.2" fill="none"/>`,
  }),
  6: face(6, '#e6c8a4', '#483c50', {
    armor: '#8a5a3a',
    hairStyle: `<path d="M27 44 q-2 -26 23 -26 q25 0 23 26 l-5 -10 q-8 -8 -18 -8 q-10 0 -18 8 Z" fill="#3a3040"/>`,
    deco: `<circle cx="35" cy="55" r="2.6" fill="#c33"/><circle cx="65" cy="55" r="2.6" fill="#c33"/>`,
  }),
};

export const HEROES: readonly HeroDef[] = [
  { id: 7, nm: '铁壁·石敢当', cls: '武', avatar: AVATARS[7]!, wu: 22, fa: 8, hp: 170, dr: 0.3, tank: true, ult: '铁壁：防御型武者，受到的伤害降低30%，天然前排' },
  { id: 8, nm: '玄盾·青璃', cls: '法', avatar: AVATARS[8]!, wu: 8, fa: 22, hp: 172, dr: 0.28, tank: true, ult: '玄盾：防御型法师，受到的伤害降低28%，天然前排' },
  { id: 1, nm: '铁掌·岳昆', cls: '武', avatar: AVATARS[1]!, wu: 52, fa: 6, hp: 100, ult: '裂石掌：对物理生物造成320%武力伤害' },
  { id: 2, nm: '断刀·戚风', cls: '武', avatar: AVATARS[2]!, wu: 48, fa: 5, hp: 96, ult: '旋风斩：全体输出，物理房内伤害翻倍' },
  { id: 3, nm: '拳娘·红缨', cls: '武', avatar: AVATARS[3]!, wu: 50, fa: 5, hp: 92, ult: '崩拳：击晕物理生物2回合' },
  { id: 4, nm: '雷法·闻潮', cls: '法', avatar: AVATARS[4]!, wu: 6, fa: 54, hp: 84, ult: '天雷引：对魔法生物造成320%法力伤害' },
  { id: 5, nm: '符师·白芷', cls: '法', avatar: AVATARS[5]!, wu: 5, fa: 46, hp: 88, ult: '缚灵符：全体输出并降低魔法生物攻速' },
  { id: 6, nm: '幽灯·聂晚', cls: '法', avatar: AVATARS[6]!, wu: 5, fa: 50, hp: 80, ult: '引魂灯：吸收魔法生物伤害为全队护盾' },
];

export const ITEMS: readonly ItemDef[] = [
  { id: 11, nm: '玄铁重甲', type: '防具', eff: '+180 承伤生命', t: 180, val: 60 },
  { id: 12, nm: '镇魂皮铠', type: '防具', eff: '+150 承伤生命, -8% 承伤', t: 150, dr: 0.08, val: 55 },
  { id: 13, nm: '金刚护腕', type: '防具', eff: '+120 承伤生命, 反伤10%', t: 120, val: 45 },
  { id: 21, nm: '百炼环首刀', type: '物理装', eff: '+26 武力', p: 26, val: 70 },
  { id: 22, nm: '穿甲弩机', type: '物理装', eff: '+18 武力, +15% 攻速', p: 18, as: 0.15, val: 65 },
  { id: 23, nm: '嗜血短戟', type: '物理装', eff: '+20 武力, 12% 吸血', p: 20, ls: 0.12, val: 60 },
  { id: 31, nm: '引雷桃木杖', type: '魔法装', eff: '+26 法力', m: 26, val: 70 },
  { id: 32, nm: '碧火琉璃珠', type: '魔法装', eff: '+18 法力, +15% 回能', m: 18, erg: 0.15, val: 65 },
  { id: 33, nm: '摄魂铜铃', type: '魔法装', eff: '+20 法力, 大招眩晕+0.4秒', m: 20, stun: 400, val: 60 },
];

export type RoomKey = 'phys' | 'magic' | 'boss';

export const ROOM_DEFS: Record<RoomKey, { nm: string; desc: string }> = {
  phys: { nm: '物理生物房', desc: '红·实体群。我方法师的输出被削弱，武者输出吃满克制。' },
  magic: { nm: '魔法生物房', desc: '蓝·幽灵群。我方武者的输出被削弱，法师输出吃满克制。' },
  boss: { nm: '将军BOSS房', desc: '镇墓将军试炼：红/蓝随种子随机现身，无克制加成，考验承伤与大招链。' },
};
