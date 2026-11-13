/** Shared balance definitions; no renderer, browser or mutable runtime state. */
import type { Difficulty, Research, UnitKind, War } from './model';

export const DIFFICULTIES: Record<Difficulty, {label:string;description:string;aiIncome:number;aiInterval:number;aiAttackAfter:number}> = {
  easy: {label:'입문',description:'아군 자원 +35% · AI 생산 45% 감소 · AI 본부 공세 260초 이후 · 폭풍 3분 이후',aiIncome:.55,aiInterval:1.7,aiAttackAfter:260},
  normal: {label:'보통',description:'같은 시작 자원 · 기본 AI 생산과 판단 속도 · AI 본부 공세는 105초 이후',aiIncome:1,aiInterval:1,aiAttackAfter:105},
  hard: {label:'도전',description:'AI 자원 생산 20% 증가 · 판단 간격 20% 감소 · AI 본부 공세 대기 없음',aiIncome:1.2,aiInterval:.8,aiAttackAfter:0},
};
export const RESEARCH: Record<Research, {label:string;description:string;maxLevel:number;requiredBarracks:number;gold:number;food:number}> = {
  weapons: {label:'강철 무기',description:'단계마다 병사 공격력 +12%',maxLevel:3,requiredBarracks:2,gold:80,food:50},
  armor: {label:'강화 갑옷',description:'단계마다 병사 전투 피해 8% 감소',maxLevel:3,requiredBarracks:2,gold:65,food:65},
  logistics: {label:'보급 체계',description:'단계마다 이동 속도 +8% · 자원 생산 +6%',maxLevel:3,requiredBarracks:2,gold:60,food:80},
};
export const NAMES = ['나', '적색', '황색', '보라'] as const;
export const OUTPOST_NAMES = ['북부 광산', '동부 시장', '남부 곡창', '서부 항구', '중앙 요새', '북서부 관문', '북동부 초소', '남서부 요새', '남동부 교역소'] as const;
/** Specialty income is added on top of mine and farm production. */
export const OUTPOST_BONUSES: ReadonlyArray<{gold:number;food:number}> = [
  {gold:3.1,food:.3}, {gold:2.5,food:1.6}, {gold:.3,food:3.4},
  {gold:2.1,food:2.1}, {gold:1.15,food:.9}, {gold:1.1,food:1.7},
  {gold:1.8,food:.8}, {gold:.7,food:2.3}, {gold:2.4,food:1.2},
];
export const MAP_HALF_SIZE = 260;
export const MAP_SIZE = MAP_HALF_SIZE * 2;
export const STORM_START = 130;
export const stormStartFor = (w: War) => w.grandBattle ? (w.difficulty === 'easy' ? 360 : 270) : w.difficulty === 'easy' ? 180 : STORM_START;
export const STORM_HQ_DAMAGE = 3.5;
export const CORNERS = [[-112,-112],[112,-112],[-112,112],[112,112]] as const;
export const OUTPOSTS = [[0,-95],[95,0],[0,95],[-95,0],[0,0],[-62,-62],[62,-62],[-62,62],[62,62]] as const;
export const UNIT_STATS: Record<UnitKind, {
  label: string; gold: number; food: number; hp: number;
  damage: number; range: number; speed: number; cooldown: number; unlock: number;
}> = {
  infantry: { label: '보병', gold: 25, food: 20, hp: 52, damage: 8, range: 3.5, speed: 8.4, cooldown: .9, unlock: 1 },
  archer: { label: '궁병', gold: 45, food: 30, hp: 36, damage: 7, range: 15, speed: 7, cooldown: 1.2, unlock: 2 },
  guardian: { label: '중장병', gold: 75, food: 45, hp: 125, damage: 14, range: 4, speed: 5.5, cooldown: 1.45, unlock: 3 },
  cavalry: { label: '기병', gold: 65, food: 55, hp: 82, damage: 12, range: 4, speed: 13.5, cooldown: .95, unlock: 3 },
};
export const MAX_UNITS = 18;
export const GRAND_MAX_UNITS = 400;
export const GRAND_INITIAL_FORCES = [100, 167, 167, 166] as const;
export const maxUnitsFor = (w: War) => w.grandBattle ? GRAND_MAX_UNITS : MAX_UNITS;
