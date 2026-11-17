// FRONTLINE (RTS) — 유닛·건물·난이도 정의. 시뮬레이션과 화면, AI 가 모두 이 표를 봅니다.

/** 시뮬레이션은 초당 20틱. 속도·쿨다운은 모두 이 틱 기준입니다. */
export const TICK = 20;
export const MAP_SIZE = 96;
export const SUPPLY_MAX = 100;
export const START_MINERALS = 400;
export const START_WORKERS = 5;
export const NODE_AMOUNT = 1500;
export const CARRY = 5;
export const MINE_TICKS = 44;

export type UnitKind = 'worker' | 'marine' | 'rocket' | 'tank';
export type BuildKind = 'hq' | 'depot' | 'barracks' | 'factory' | 'tower';
export type WeaponKind = 'bullet' | 'rocket' | 'cannon';
export type ArmorKind = 'light' | 'armored' | 'structure';

export interface UnitDef {
  name: string; role: string; hp: number; speed: number; radius: number;
  dmg: number; weapon: WeaponKind; range: number; cd: number; splash: number;
  cost: number; supply: number; time: number; armor: ArmorKind; req?: BuildKind; key: string; from: BuildKind;
}
export interface BuildDef {
  name: string; role: string; size: number; hp: number; cost: number; time: number; supply: number;
  req?: BuildKind; key: string; trains: UnitKind[];
  dmg?: number; range?: number; cd?: number;
}

export const UNITS: Record<UnitKind, UnitDef> = {
  worker: { name: '일꾼', role: '채취 · 건설', hp: 45, speed: 3.1, radius: 0.34, dmg: 5, weapon: 'bullet', range: 0.9, cd: 16, splash: 0, cost: 50, supply: 1, time: 160, armor: 'light', key: 'Q', from: 'hq' },
  marine: { name: '보병', role: '기본 사격', hp: 55, speed: 3.3, radius: 0.38, dmg: 7, weapon: 'bullet', range: 5, cd: 12, splash: 0, cost: 50, supply: 1, time: 200, armor: 'light', key: 'Q', from: 'barracks' },
  rocket: { name: '로켓병', role: '대 장갑', hp: 80, speed: 2.8, radius: 0.42, dmg: 18, weapon: 'rocket', range: 6.5, cd: 30, splash: 0, cost: 100, supply: 2, time: 280, armor: 'light', req: 'barracks', key: 'W', from: 'barracks' },
  tank: { name: '전차', role: '광역 포격', hp: 190, speed: 2.3, radius: 0.75, dmg: 30, weapon: 'cannon', range: 8.5, cd: 36, splash: 1.7, cost: 175, supply: 3, time: 420, armor: 'armored', req: 'factory', key: 'Q', from: 'factory' },
};

export const BUILDINGS: Record<BuildKind, BuildDef> = {
  hq: { name: '사령부', role: '일꾼 생산 · 자원 반납', size: 4, hp: 1500, cost: 400, time: 1200, supply: 10, key: 'H', trains: ['worker'] },
  depot: { name: '보급소', role: '인구수 +8', size: 2, hp: 400, cost: 100, time: 280, supply: 8, key: 'D', trains: [] },
  barracks: { name: '병영', role: '보병 · 로켓병', size: 3, hp: 900, cost: 150, time: 560, supply: 0, req: 'hq', key: 'B', trains: ['marine', 'rocket'] },
  factory: { name: '공장', role: '전차', size: 3, hp: 1000, cost: 200, time: 720, supply: 0, req: 'barracks', key: 'F', trains: ['tank'] },
  tower: { name: '방어탑', role: '자동 사격', size: 2, hp: 500, cost: 125, time: 400, supply: 0, req: 'barracks', key: 'T', trains: [], dmg: 12, range: 7.5, cd: 14 },
};

export type ResearchKind = 'atk' | 'arm' | 'cannon';
export interface ResearchDef { name: string; role: string; cost: number; time: number; from: BuildKind; key: string }
/** 병영·공장에서 연구하는 강화. 한 번 끝내면 그 판 내내 적용됩니다. */
export const RESEARCH: Record<ResearchKind, ResearchDef> = {
  atk: { name: '강화 탄환', role: '보병·로켓병·방어탑 공격력 +25%', cost: 150, time: 45 * TICK, from: 'barracks', key: 'E' },
  arm: { name: '강화 장갑', role: '모든 유닛·건물이 받는 피해 -20%', cost: 150, time: 45 * TICK, from: 'barracks', key: 'T' },
  cannon: { name: '고폭탄', role: '전차 공격력 +25%, 폭발 범위 확대', cost: 200, time: 50 * TICK, from: 'factory', key: 'E' },
};
export const RESEARCH_KINDS = Object.keys(RESEARCH) as ResearchKind[];

/** 무기 종류 × 방어 종류 피해 배율. */
export const MULT: Record<WeaponKind, Record<ArmorKind, number>> = {
  bullet: { light: 1, armored: 0.55, structure: 0.5 },
  rocket: { light: 0.8, armored: 1.7, structure: 1 },
  cannon: { light: 1, armored: 1, structure: 1.2 },
};

export type Difficulty = 'easy' | 'normal' | 'hard' | 'brutal';
export interface AiLevel {
  label: string; blurb: string;
  /** AI 가 생각하는 간격(틱). */ think: number;
  research: boolean; workers: number; barracks: number; factory: number; tower: number; expand: boolean;
  /** 이 시각(틱) 전에는 공격하지 않습니다. */ attackAfter: number;
  /** 공격을 시작하는 병력(인구수). */ wave: number;
  /** 첫 생산을 미루는 시간(틱). */ delay: number;
  /** 채취량 배율. 1보다 크면 AI 가 자원을 더 받습니다. */ income: number;
  mix: Record<'marine' | 'rocket' | 'tank', number>; retreat: boolean;
}
export const LEVELS: Record<Difficulty, AiLevel> = {
  easy: { label: '쉬움', blurb: '느리게 자라고 보병만 보냅니다. 기본기를 익히기 좋습니다.', think: 50, research: false, workers: 9, barracks: 1, factory: 0, tower: 0, expand: false, attackAfter: 7 * 60 * TICK, wave: 14, delay: 15 * TICK, income: 1, mix: { marine: 1, rocket: 0, tank: 0 }, retreat: false },
  normal: { label: '보통', blurb: '병영을 늘리고 로켓병·전차를 섞어 정해진 시간에 공격합니다.', think: 34, research: true, workers: 14, barracks: 2, factory: 1, tower: 1, expand: false, attackAfter: 5 * 60 * TICK, wave: 30, delay: 4 * TICK, income: 1, mix: { marine: 3, rocket: 2, tank: 1 }, retreat: false },
  hard: { label: '어려움', blurb: '빠르게 확장하고 병력을 계속 보충하며, 불리하면 물러납니다.', think: 22, research: true, workers: 20, barracks: 3, factory: 2, tower: 2, expand: true, attackAfter: 4 * 60 * TICK, wave: 40, delay: 0, income: 1, mix: { marine: 3, rocket: 2, tank: 2 }, retreat: true },
  brutal: { label: '매우 어려움', blurb: '숙련자용. 확장과 압박이 빠르고, 채취량 보너스 +25%를 받습니다.', think: 14, research: true, workers: 24, barracks: 4, factory: 3, tower: 2, expand: true, attackAfter: 4 * 60 * TICK + 20 * TICK, wave: 44, delay: 0, income: 1.25, mix: { marine: 3, rocket: 2, tank: 3 }, retreat: true },
};
export const DIFFICULTIES = Object.keys(LEVELS) as Difficulty[];
export const isDifficulty = (v: unknown): v is Difficulty => typeof v === 'string' && v in LEVELS;

export const TEAM_COLORS = [0x3d8bff, 0xff5a3c] as const;
export const TEAM_NAMES = ['청군', '적군'] as const;
