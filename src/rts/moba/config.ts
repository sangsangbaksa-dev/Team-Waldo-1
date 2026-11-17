// FRONTLINE 롤식 라인전 — 맵·챔피언·아이템·정글 정의. 시뮬레이션·화면·AI 가 모두 이 표를 봅니다.
import { TICK } from '../config';

export const SIZE = 100;
export type Lane = 'top' | 'mid' | 'bot';
export const LANES: Lane[] = ['top', 'mid', 'bot'];
/** 한 팀이 맡는 자리: 세 라인 + 정글러. */
export type Role = Lane | 'jungle';
export const ROLES: Role[] = [...LANES, 'jungle'];
export interface Pt { x: number; y: number }
/** 청 진영(왼쪽 아래)에서 적 진영(오른쪽 위)으로 가는 길목. 적 진영 쪽은 점대칭으로 만듭니다. */
export const NEXUS: [Pt, Pt] = [{ x: 9, y: 91 }, { x: 91, y: 9 }];
export const flip = (p: Pt): Pt => ({ x: SIZE - p.x, y: SIZE - p.y });
const TOP: Pt[] = [NEXUS[0], { x: 13, y: 84 }, { x: 11, y: 56 }, { x: 11, y: 22 }, { x: 14, y: 12 }, { x: 28, y: 10 }, { x: 56, y: 11 }, { x: 84, y: 13 }, NEXUS[1]];
/** 청 진영에서 적 진영으로 가는 길목. 지도는 점대칭이라 bot 은 top 을 뒤집어 거꾸로 읽은 길입니다. */
export const LANE_PTS: Record<Lane, Pt[]> = {
  top: TOP,
  mid: [NEXUS[0], { x: 15, y: 85 }, { x: 32, y: 68 }, { x: 50, y: 50 }, { x: 68, y: 32 }, { x: 85, y: 15 }, NEXUS[1]],
  bot: TOP.map(flip).reverse(),
};
/** team 이 걸어가는 순서의 길목(청은 그대로, 적은 거꾸로). */
export function lanePath(lane: Lane, team: number): Pt[] {
  const base = LANE_PTS[lane].map(p => ({ ...p })); return team === 0 ? base : base.reverse();
}
/** 청 진영 쪽 포탑 위치(길목 위, 바깥 → 안쪽 순서). */
const TURRET_BLUE: Record<Lane, Pt[]> = {
  top: [{ x: 11, y: 30 }, { x: 11, y: 52 }, { x: 12.3, y: 74 }],
  mid: [{ x: 41, y: 59 }, { x: 31, y: 69 }, { x: 21, y: 79 }],
  bot: [{ x: 56, y: 89.4 }, { x: 36, y: 88.4 }, { x: 22, y: 87.4 }],
};
const MIRROR: Record<Lane, Lane> = { top: 'bot', mid: 'mid', bot: 'top' };
/** 점대칭이라 적 진영의 top 길 포탑은 청 진영 bot 길 포탑을 뒤집은 자리입니다. */
export function turretSpots(lane: Lane, team: number): Pt[] {
  return team === 0 ? TURRET_BLUE[lane].map(p => ({ ...p })) : TURRET_BLUE[MIRROR[lane]].map(flip);
}
/** 억제기: 각 길의 가장 안쪽 포탑 뒤, 넥서스 앞. 부수면 그 길로 슈퍼 미니언이 나옵니다. */
const INHIB_BLUE: Record<Lane, Pt> = { top: { x: 12.4, y: 82.4 }, mid: { x: 16.2, y: 84.6 }, bot: { x: 17.2, y: 88.4 } };
export function inhibSpot(lane: Lane, team: number): Pt { return team === 0 ? { ...INHIB_BLUE[lane] } : flip(INHIB_BLUE[MIRROR[lane]]); }
export const INHIB_RESPAWN = 300;
export const RIVER: Pt[] = [{ x: 2, y: 2 }, { x: 30, y: 30 }, { x: 50, y: 50 }, { x: 70, y: 70 }, { x: 98, y: 98 }];

export type MonsterKind = 'wolf' | 'golem' | 'drake' | 'baron';
export interface MonsterDef { name: string; hp: number; dmg: number; range: number; cd: number; speed: number; radius: number; gold: number; xp: number; respawn: number; first: number }
export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  wolf: { name: '늑대', hp: 520, dmg: 26, range: 1.6, cd: 22, speed: 3.3, radius: 0.55, gold: 40, xp: 70, respawn: 60, first: 20 },
  golem: { name: '바위 골렘', hp: 1250, dmg: 52, range: 1.8, cd: 26, speed: 2.8, radius: 0.9, gold: 110, xp: 160, respawn: 100, first: 30 },
  drake: { name: '화염 드래곤', hp: 3300, dmg: 90, range: 3.2, cd: 28, speed: 3, radius: 1.5, gold: 150, xp: 260, respawn: 240, first: 150 },
  baron: { name: '심연의 군주', hp: 6800, dmg: 150, range: 3.6, cd: 28, speed: 2.8, radius: 1.9, gold: 300, xp: 500, respawn: 330, first: 600 },
};
export interface Camp { id: string; at: Pt; mobs: Array<{ k: MonsterKind; dx: number; dy: number }> }
/** 청 쪽 정글(절반)과 강의 중립 몬스터. 반대쪽은 점대칭으로 만듭니다. */
export const CAMPS_HALF: Camp[] = [
  { id: 'wolves-a', at: { x: 26, y: 44 }, mobs: [{ k: 'wolf', dx: 0, dy: 0 }, { k: 'wolf', dx: 1.3, dy: 0.8 }, { k: 'wolf', dx: -1.1, dy: 1 }] },
  { id: 'golem-a', at: { x: 22, y: 31 }, mobs: [{ k: 'golem', dx: 0, dy: 0 }] },
  { id: 'wolves-b', at: { x: 36, y: 77 }, mobs: [{ k: 'wolf', dx: 0, dy: 0 }, { k: 'wolf', dx: 1.3, dy: -0.8 }, { k: 'wolf', dx: -1.1, dy: -1 }] },
  { id: 'golem-b', at: { x: 46, y: 70 }, mobs: [{ k: 'golem', dx: 0, dy: 0 }] },
];
export const RIVER_CAMPS: Camp[] = [
  { id: 'baron', at: { x: 30, y: 30 }, mobs: [{ k: 'baron', dx: 0, dy: 0 }] },
  { id: 'drake', at: { x: 70, y: 70 }, mobs: [{ k: 'drake', dx: 0, dy: 0 }] },
];

export type ChampId = 'blade' | 'arcana' | 'ranger' | 'shade' | 'priest' | 'titan' | 'ember' | 'lancer' | 'seer';
export type SkillKind = 'shot' | 'aoe' | 'dash' | 'buff';
export interface SkillDef {
  key: 'Q' | 'W' | 'E' | 'R'; name: string; desc: string; kind: SkillKind; cd: number; mana: number; range: number; level: number;
  radius?: number; heal?: number; dmg?: number; ratio?: number; slow?: number; stun?: number; shield?: number; aspd?: number; speed?: number; dur?: number; width?: number; pierce?: boolean;
}
export interface ChampDef {
  name: string; role: string; blurb: string; color: number; model: 'marine' | 'worker' | 'rocket'; scale: number;
  hp: number; mp: number; ad: number; def: number; speed: number; range: number; cd: number;
  hpUp: number; mpUp: number; adUp: number; defUp: number; skills: SkillDef[];
}
const s = (n: number): number => Math.round(n * TICK);
export const CHAMPS = {} as Record<ChampId, ChampDef>;
Object.assign(CHAMPS, {
  blade: {
    name: '블레이드', role: '전사 · 근접', blurb: '돌진하고 베고 방벽을 두르는 전방 전사. 궁극기로 적진 한가운데를 내리찍습니다.', color: 0x59a8ff, model: 'marine', scale: 1.7,
    hp: 640, mp: 280, ad: 58, def: 30, speed: 3.9, range: 1.8, cd: 22, hpUp: 98, mpUp: 34, adUp: 4.2, defUp: 3.6,
    skills: [
      { key: 'Q', name: '돌진 일격', desc: '지정한 곳으로 돌진해 도착 지점의 적을 벱니다.', kind: 'dash', cd: s(7), mana: 40, range: 6.5, level: 1, radius: 2, dmg: 70, ratio: 0.9, slow: 0.3, dur: s(1.5) },
      { key: 'W', name: '철벽', desc: '4초간 피해를 막는 방벽을 두르고 이동 속도가 오릅니다.', kind: 'buff', cd: s(14), mana: 55, range: 0, level: 1, shield: 140, ratio: 1.2, speed: 0.35, dur: s(4) },
      { key: 'E', name: '회전 베기', desc: '주변의 모든 적에게 피해를 주고 느리게 합니다.', kind: 'aoe', cd: s(8), mana: 50, range: 0, level: 1, radius: 3.4, dmg: 65, ratio: 0.8, slow: 0.4, dur: s(2) },
      { key: 'R', name: '대지 강타', desc: '크게 도약해 내리찍어 범위 안의 적을 기절시킵니다.', kind: 'dash', cd: s(60), mana: 110, range: 9, level: 3, radius: 4, dmg: 190, ratio: 1.4, stun: s(1.6) },
    ],
  },
  arcana: {
    name: '아르카나', role: '마법사 · 원거리', blurb: '긴 사거리의 마법 폭격. 빙결 지대로 발을 묶고 별의 폭풍으로 전투를 끝냅니다.', color: 0xb26bff, model: 'worker', scale: 1.9,
    hp: 540, mp: 430, ad: 50, def: 24, speed: 3.7, range: 6.4, cd: 24, hpUp: 84, mpUp: 52, adUp: 3.4, defUp: 3,
    skills: [
      { key: 'Q', name: '마력탄', desc: '앞으로 마력탄을 쏴 처음 맞은 적에게 큰 피해를 줍니다.', kind: 'shot', cd: s(5), mana: 45, range: 13, level: 1, width: 1.1, dmg: 85, ratio: 1.1 },
      { key: 'W', name: '빙결 지대', desc: '지정한 곳의 적을 느리게 하고 피해를 줍니다.', kind: 'aoe', cd: s(9), mana: 60, range: 10, level: 1, radius: 3.2, dmg: 55, ratio: 0.7, slow: 0.5, dur: s(2.5) },
      { key: 'E', name: '순간 이동', desc: '짧은 거리를 순식간에 이동합니다.', kind: 'dash', cd: s(11), mana: 50, range: 6.5, level: 1 },
      { key: 'R', name: '별의 폭풍', desc: '넓은 범위에 별을 쏟아붓습니다.', kind: 'aoe', cd: s(55), mana: 130, range: 12, level: 3, radius: 5, dmg: 240, ratio: 1.5 },
    ],
  },
  ranger: {
    name: '레인저', role: '원거리 딜러', blurb: '빠른 공격으로 포탑까지 녹이는 딜러. 궁극기 저격은 화면 끝까지 닿습니다.', color: 0x5dff9a, model: 'rocket', scale: 1.5,
    hp: 560, mp: 320, ad: 56, def: 26, speed: 3.8, range: 6, cd: 19, hpUp: 88, mpUp: 38, adUp: 4.8, defUp: 3.2,
    skills: [
      { key: 'Q', name: '속사', desc: '4초간 공격 속도가 크게 오릅니다.', kind: 'buff', cd: s(12), mana: 40, range: 0, level: 1, aspd: 0.7, dur: s(4) },
      { key: 'W', name: '화살비', desc: '지정한 곳에 화살비를 쏟아 피해를 줍니다.', kind: 'aoe', cd: s(8), mana: 55, range: 9, level: 1, radius: 3, dmg: 60, ratio: 0.9, slow: 0.25, dur: s(1.5) },
      { key: 'E', name: '구르기', desc: '뒤로 재빨리 구릅니다.', kind: 'dash', cd: s(9), mana: 35, range: 5, level: 1 },
      { key: 'R', name: '저격', desc: '아주 먼 곳까지 날아가 처음 맞은 적에게 치명타를 입힙니다.', kind: 'shot', cd: s(50), mana: 100, range: 26, level: 3, width: 1.2, dmg: 260, ratio: 1.6 },
    ],
  },
});
CHAMPS.shade = {
  name: '섀이드', role: '암살자 · 근접', blurb: '빠르게 파고들어 한 명을 삭제하는 암살자. 처형으로 약해진 적을 끝냅니다.', color: 0x8a5bff, model: 'marine', scale: 1.45,
  hp: 560, mp: 300, ad: 62, def: 26, speed: 4.2, range: 1.7, cd: 18, hpUp: 88, mpUp: 30, adUp: 4.6, defUp: 3.2,
  skills: [
    { key: 'Q', name: '그림자 베기', desc: '주변의 적을 빠르게 베어 피해를 줍니다.', kind: 'aoe', cd: s(5), mana: 35, range: 0, level: 1, radius: 2.7, dmg: 55, ratio: 0.9 },
    { key: 'W', name: '암영 질주', desc: '3초간 이동·공격 속도가 오릅니다.', kind: 'buff', cd: s(11), mana: 40, range: 0, level: 1, speed: 0.5, aspd: 0.3, dur: s(3) },
    { key: 'E', name: '그림자 도약', desc: '지정한 곳으로 도약해 도착 지점의 적을 벱니다.', kind: 'dash', cd: s(9), mana: 45, range: 6.5, level: 1, radius: 2, dmg: 60, ratio: 0.8 },
    { key: 'R', name: '처형', desc: '먼 적에게 순식간에 달려들어 큰 피해를 주고 잠시 기절시킵니다.', kind: 'dash', cd: s(55), mana: 100, range: 10, level: 3, radius: 3, dmg: 230, ratio: 1.5, stun: s(0.8) },
  ],
};
CHAMPS.priest = {
  name: '프리스트', role: '지원가 · 원거리', blurb: '아군을 치유하고 방벽을 씌우는 지원가. 천벌로 교전을 뒤집습니다.', color: 0xffe27a, model: 'worker', scale: 1.8,
  hp: 520, mp: 440, ad: 46, def: 24, speed: 3.7, range: 5.8, cd: 24, hpUp: 82, mpUp: 50, adUp: 3.1, defUp: 3,
  skills: [
    { key: 'Q', name: '성광탄', desc: '앞으로 빛의 탄을 쏴 처음 맞은 적에게 피해를 줍니다.', kind: 'shot', cd: s(5), mana: 45, range: 11, level: 1, width: 1, dmg: 70, ratio: 1 },
    { key: 'W', name: '치유의 빛', desc: '주변 아군(나 포함)의 체력을 회복합니다.', kind: 'buff', cd: s(12), mana: 60, range: 0, level: 1, radius: 5.5, heal: 110, ratio: 0.8 },
    { key: 'E', name: '신성한 방벽', desc: '3초간 피해를 막는 방벽을 두르고 빨라집니다.', kind: 'buff', cd: s(14), mana: 55, range: 0, level: 1, shield: 120, ratio: 1, speed: 0.2, dur: s(3) },
    { key: 'R', name: '천벌', desc: '넓은 범위의 적에게 큰 피해를 주고 기절시킵니다.', kind: 'aoe', cd: s(55), mana: 120, range: 11, level: 3, radius: 4.5, dmg: 220, ratio: 1.4, stun: s(1) },
  ],
};

CHAMPS.titan = {
  name: '타이탄', role: '탱커 · 근접', blurb: '아군 앞에서 버티며 적을 묶는 돌격대장. 궁극기 한 번이면 적진이 멈춥니다.', color: 0xff9a4a, model: 'marine', scale: 2.05,
  hp: 720, mp: 260, ad: 48, def: 38, speed: 3.6, range: 1.8, cd: 24, hpUp: 124, mpUp: 30, adUp: 3, defUp: 4.4,
  skills: [
    { key: 'Q', name: '방패 돌진', desc: '앞으로 돌진해 부딪힌 적을 잠깐 기절시킵니다.', kind: 'dash', cd: s(9), mana: 40, range: 6, level: 1, radius: 1.9, dmg: 50, ratio: 0.6, stun: s(0.6) },
    { key: 'W', name: '불굴', desc: '4초간 두꺼운 방벽을 두르고 체력을 조금 회복합니다.', kind: 'buff', cd: s(16), mana: 50, range: 0, level: 1, radius: 1, shield: 170, ratio: 1.1, heal: 50, dur: s(4) },
    { key: 'E', name: '대지 진동', desc: '주변을 짓밟아 피해를 주고 크게 느리게 합니다.', kind: 'aoe', cd: s(9), mana: 50, range: 0, level: 1, radius: 3.6, dmg: 60, ratio: 0.6, slow: 0.5, dur: s(2.5) },
    { key: 'R', name: '철벽 요새', desc: '주변의 모든 적을 짓눌러 기절시킵니다.', kind: 'aoe', cd: s(70), mana: 100, range: 0, level: 3, radius: 5, dmg: 150, ratio: 1, stun: s(1.4) },
  ],
};
CHAMPS.ember = {
  name: '엠버', role: '마법사 · 폭딜', blurb: '불꽃으로 한 번에 크게 태우는 마법사. 운석 한 방이 교전을 끝냅니다.', color: 0xff6a3a, model: 'worker', scale: 1.85,
  hp: 520, mp: 460, ad: 52, def: 22, speed: 3.7, range: 6, cd: 26, hpUp: 82, mpUp: 54, adUp: 3.6, defUp: 2.8,
  skills: [
    { key: 'Q', name: '화염구', desc: '불덩이를 쏴 처음 맞은 적에게 큰 피해를 줍니다.', kind: 'shot', cd: s(5.5), mana: 50, range: 12, level: 1, width: 1.3, dmg: 95, ratio: 1.2 },
    { key: 'W', name: '불기둥', desc: '지정한 곳에 불기둥을 세워 피해를 주고 느리게 합니다.', kind: 'aoe', cd: s(8), mana: 60, range: 9, level: 1, radius: 2.6, dmg: 80, ratio: 0.9, slow: 0.3, dur: s(1.5) },
    { key: 'E', name: '화염 도약', desc: '불길을 남기며 뒤로 빠지고 잠시 빨라집니다.', kind: 'dash', cd: s(11), mana: 45, range: 6, level: 1, speed: 0.3, dur: s(2) },
    { key: 'R', name: '운석 낙하', desc: '넓은 범위에 운석을 떨어뜨려 큰 피해를 주고 잠시 기절시킵니다.', kind: 'aoe', cd: s(60), mana: 140, range: 13, level: 3, radius: 5.5, dmg: 270, ratio: 1.6, stun: s(0.5) },
  ],
};
CHAMPS.lancer = {
  name: '랜서', role: '투사 · 근접', blurb: '긴 창으로 찌르고 파고드는 투사. 싸울수록 체력을 되찾고 용창으로 끝을 봅니다.', color: 0xffd24a, model: 'marine', scale: 1.6,
  hp: 600, mp: 240, ad: 60, def: 28, speed: 4, range: 2.2, cd: 20, hpUp: 94, mpUp: 28, adUp: 4.4, defUp: 3.4,
  skills: [
    { key: 'Q', name: '창 찌르기', desc: '앞으로 창을 뻗어 일직선 위의 적을 모두 꿰뚫습니다.', kind: 'shot', cd: s(5), mana: 35, range: 5.5, level: 1, width: 1, dmg: 70, ratio: 1, pierce: true },
    { key: 'W', name: '투지', desc: '3.5초간 공격·이동 속도가 오르고 체력을 회복합니다.', kind: 'buff', cd: s(12), mana: 40, range: 0, level: 1, radius: 0.5, heal: 60, ratio: 0.5, aspd: 0.5, speed: 0.25, dur: s(3.5) },
    { key: 'E', name: '도약 찌르기', desc: '지정한 곳으로 도약해 적을 찌르고 방벽을 얻습니다.', kind: 'dash', cd: s(8), mana: 45, range: 6, level: 1, radius: 2, dmg: 65, ratio: 0.8, shield: 90, dur: s(2.5) },
    { key: 'R', name: '용창', desc: '먼 적에게 날아들어 큰 피해를 주고 잠시 기절시킵니다.', kind: 'dash', cd: s(55), mana: 100, range: 9, level: 3, radius: 3.2, dmg: 240, ratio: 1.5, stun: s(0.5) },
  ],
};
CHAMPS.seer = {
  name: '세이어', role: '제어 · 원거리', blurb: '속박 구슬과 별빛 장막으로 적을 묶는 제어 마법사. 심판의 빛이 전열을 가릅니다.', color: 0x6af0ff, model: 'worker', scale: 1.75,
  hp: 510, mp: 470, ad: 44, def: 23, speed: 3.7, range: 6.2, cd: 25, hpUp: 80, mpUp: 52, adUp: 3, defUp: 2.9,
  skills: [
    { key: 'Q', name: '속박 구슬', desc: '구슬을 쏴 처음 맞은 적을 묶고 피해를 줍니다.', kind: 'shot', cd: s(8), mana: 55, range: 11, level: 1, width: 1, dmg: 60, ratio: 0.8, stun: s(0.8) },
    { key: 'W', name: '별빛 장막', desc: '지정한 곳에 장막을 펼쳐 적을 크게 느리게 합니다.', kind: 'aoe', cd: s(11), mana: 60, range: 9, level: 1, radius: 4, dmg: 40, ratio: 0.5, slow: 0.6, dur: s(3) },
    { key: 'E', name: '차원 이동', desc: '짧은 거리를 이동하고 잠시 빨라집니다.', kind: 'dash', cd: s(12), mana: 50, range: 6, level: 1, speed: 0.25, dur: s(1.5) },
    { key: 'R', name: '심판의 빛', desc: '넓은 범위에 빛의 기둥을 내려 큰 피해를 주고 기절시킵니다.', kind: 'aoe', cd: s(60), mana: 130, range: 12, level: 3, radius: 6, dmg: 190, ratio: 1.2, stun: s(1.2) },
  ],
};
export const CHAMP_IDS = Object.keys(CHAMPS) as ChampId[];

export type ItemId = 'sword' | 'plate' | 'ruby' | 'boots' | 'crystal' | 'scythe' | 'bow' | 'heart' | 'cloak' | 'wand' | 'aegis' | 'tome' | 'crown' | 'mask' | 'ring' | 'tabi' | 'thorn';
export interface ItemDef { name: string; role: string; cost: number; ad?: number; def?: number; hp?: number; mp?: number; speed?: number; steal?: number; haste?: number; cdr?: number }
export const ITEMS: Record<ItemId, ItemDef> = {
  sword: { name: '장검', role: '공격력 +14', cost: 350, ad: 14 },
  plate: { name: '천 갑옷', role: '방어력 +18', cost: 300, def: 18 },
  ruby: { name: '루비 수정', role: '체력 +160', cost: 400, hp: 160 },
  boots: { name: '장화', role: '이동 속도 +0.5', cost: 300, speed: 0.5 },
  crystal: { name: '마나 수정', role: '마나 +240', cost: 350, mp: 240 },
  scythe: { name: '흡혈의 낫', role: '공격력 +16 · 흡혈 10%', cost: 800, ad: 16, steal: 0.1 },
  bow: { name: '질풍의 활', role: '공격력 +10 · 공격 속도 +25%', cost: 700, ad: 10, haste: 0.25 },
  heart: { name: '거인의 심장', role: '체력 +420 · 방어력 +20', cost: 1000, hp: 420, def: 20 },
  cloak: { name: '질주의 망토', role: '이동 속도 +0.35 · 방어력 +12', cost: 450, speed: 0.35, def: 12 },
  wand: { name: '마도서', role: '공격력 +18 · 마나 +200', cost: 800, ad: 18, mp: 200 },
  aegis: { name: '수호의 방패', role: '방어력 +32 · 체력 +200', cost: 900, def: 32, hp: 200 },
  tome: { name: '룬 서판', role: '스킬 가속 +10% · 마나 +150', cost: 600, cdr: 0.1, mp: 150 },
  crown: { name: '전사의 왕관', role: '공격력 +14 · 방어력 +14 · 체력 +140', cost: 1100, ad: 14, def: 14, hp: 140 },
  mask: { name: '광전사의 가면', role: '공격력 +22 · 공격 속도 +20%', cost: 1300, ad: 22, haste: 0.2 },
  ring: { name: '마나의 반지', role: '마나 +360 · 스킬 가속 +15%', cost: 1000, mp: 360, cdr: 0.15 },
  tabi: { name: '철갑 장화', role: '이동 속도 +0.7 · 방어력 +14', cost: 650, speed: 0.7, def: 14 },
  thorn: { name: '가시 갑옷', role: '방어력 +40 · 체력 +100', cost: 850, def: 40, hp: 100 },
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const MAX_ITEMS = 6;

/** 소환사 주문(D·F). 재사용 대기는 초 단위. */
export type SpellId = 'flash' | 'heal' | 'ignite' | 'barrier' | 'ghost';
export const SPELLS: Record<SpellId, { name: string; desc: string; cd: number; key: string }> = {
  flash: { name: '점멸', desc: '커서 방향으로 순식간에 이동합니다.', cd: 150, key: '점' },
  heal: { name: '회복', desc: '체력을 회복하고, 가까운 아군도 절반을 회복합니다.', cd: 120, key: '회' },
  ignite: { name: '점화', desc: '가까운 적 챔피언을 불태워 피해를 줍니다.', cd: 90, key: '화' },
  barrier: { name: '방어막', desc: '2초간 피해를 막는 방어막을 두릅니다.', cd: 120, key: '막' },
  ghost: { name: '유체화', desc: '6초간 이동 속도가 크게 오릅니다.', cd: 120, key: '유' },
};
export const SPELL_IDS = Object.keys(SPELLS) as SpellId[];

/** 룬(핵심 룬 하나). 능력치와 작은 효과를 줍니다. */
export type RuneId = 'conqueror' | 'electro' | 'fortitude' | 'swift';
export const RUNES: Record<RuneId, { name: string; desc: string; ad?: number; hp?: number; def?: number; speed?: number; cdr?: number; mp?: number }> = {
  conqueror: { name: '정복자', desc: '공격력 +6, 챔피언에게 주는 피해 +8%, 피해의 5% 흡혈.', ad: 6 },
  electro: { name: '감전', desc: '같은 챔피언을 3번 맞히면 추가 폭발 피해 (재사용 20초).', ad: 3 },
  fortitude: { name: '강인함', desc: '체력 +180, 방어력 +6, 마나 +60.', hp: 180, def: 6, mp: 60 },
  swift: { name: '신속', desc: '이동 속도 +0.3, 스킬 가속 +6%.', speed: 0.3, cdr: 0.06 },
};
export const RUNE_IDS = Object.keys(RUNES) as RuneId[];
/** 정글 버프(파랑·빨강): 몬스터를 처치하면 2분간 받습니다. */
export const BUFF_TIME = 120;

export type Level = 'easy' | 'normal' | 'hard';
export const LEVELS: Record<Level, { label: string; blurb: string; aim: number; goldMul: number; react: number }> = {
  easy: { label: '쉬움', blurb: '적 챔피언이 조심스럽고 스킬을 아낍니다.', aim: 0.5, goldMul: 0.85, react: 12 },
  normal: { label: '보통', blurb: '라인을 밀고 교전하며 아이템을 맞춰 삽니다.', aim: 0.8, goldMul: 1, react: 7 },
  hard: { label: '어려움', blurb: '스킬을 정확히 맞히고 정글과 용도 챙깁니다.', aim: 1, goldMul: 1.15, react: 4 },
};
export const MAX_LEVEL = 15;
export const xpNeed = (lv: number): number => 110 + 60 * lv;
export const WAVE_FIRST = 12 * TICK; export const WAVE_EVERY = 28 * TICK;
