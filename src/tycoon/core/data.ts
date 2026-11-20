// 정적 카탈로그: 단계, 구역, 스폿, 업종, 일자리, 이벤트, 해외 시장. 밸런스 숫자는 전부 여기 모은다.
import type { District, LotSize, ShopKind, SpotDef, Stage } from './types';

export const STAGES: readonly Stage[] = ['broke', 'parttime', 'smallshop', 'bigshop', 'business', 'corp', 'world'];

export const STAGE_NAMES: Record<Stage, string> = {
  broke: '빈털터리',
  parttime: '알바생',
  smallshop: '작은 가게 사장',
  bigshop: '큰 가게 사장',
  business: '사업가',
  corp: '대기업 회장',
  world: '세계 정복자',
};

export function stageIndex(stage: Stage): number { return STAGES.indexOf(stage); }
export function stageAtLeast(stage: Stage, min: Stage): boolean { return stageIndex(stage) >= stageIndex(min); }

// ── 시간 ───────────────────────────────────────────────
/** 실시간 1초 = 게임 6분. 하루 = 4분 */
export const GAME_MIN_PER_SEC = 6;
export const DAY_MINUTES = 1440;
export const START_MINUTE = 6 * 60;
export const OPEN_HOUR = 7;
export const CLOSE_HOUR = 23;
export const NIGHT_FROM = 20;
export const NIGHT_TO = 6;

// ── 플레이어 ───────────────────────────────────────────
export const ENERGY_MAX = 100;
export const BOTTLE_CAP = 30;
export const BOTTLE_PRICE = 2;
export const CARGO_CAP = 60;
/** 사장이 가게에 서 있으면 시간당 소모하는 에너지 */
export const OWNER_ENERGY_PER_HOUR = 3;
/** 사장 한 명이 분당 응대하는 손님 */
export const OWNER_SERVE_PER_MIN = 0.6;
export const CLERK_SERVE_PER_MIN = 0.4;

// ── 구역 ───────────────────────────────────────────────
export interface DistrictDef {
  id: District;
  name: string;
  minStage: Stage;
  /** 유동 인구 배수 */
  traffic: number;
  /** 지갑 두께: 높을수록 비싼 가격을 견딘다 */
  wealth: number;
  /** 부지 기본가(크기 배수 곱함) */
  landPrice: number;
}

export const DISTRICTS: Record<District, DistrictDef> = {
  slum: { id: 'slum', name: '뒷골목', minStage: 'broke', traffic: 0.6, wealth: 0.8, landPrice: 200 },
  market: { id: 'market', name: '시장통', minStage: 'broke', traffic: 1.0, wealth: 1.0, landPrice: 800 },
  downtown: { id: 'downtown', name: '도심', minStage: 'smallshop', traffic: 1.8, wealth: 1.2, landPrice: 6000 },
  harbor: { id: 'harbor', name: '항구', minStage: 'parttime', traffic: 0.7, wealth: 0.9, landPrice: 3000 },
  uptown: { id: 'uptown', name: '부촌', minStage: 'bigshop', traffic: 1.3, wealth: 1.6, landPrice: 15000 },
};

export const LOT_SIZE_MULT: Record<LotSize, number> = { S: 1, M: 2.5, L: 6, I: 5 };
export const LOT_KINDS: Record<LotSize, ShopKind[]> = {
  S: ['stall', 'cafe'],
  M: ['stall', 'cafe', 'mart', 'restaurant'],
  L: ['cafe', 'mart', 'restaurant', 'boutique', 'tech'],
  I: ['factory'],
};

// ── 업종 ───────────────────────────────────────────────
export interface ShopKindDef {
  kind: ShopKind;
  name: string;
  icon: string;
  minStage: Stage;
  buildCost: number;
  /** 손님 1명당 기본 판매가 */
  price: number;
  /** 손님 1명당 원가(재고 1개) */
  unitCost: number;
  /** 시장통 기준 시간당 잠재 손님(레벨 1) */
  demand: number;
  maxLevel: number;
  /** 레벨 1 재고 상한 */
  stock: number;
  /** 시간대별 수요 곡선 */
  curve: 'meal' | 'coffee' | 'retail' | 'flat';
}

export const SHOP_KINDS: Record<ShopKind, ShopKindDef> = {
  stall: { kind: 'stall', name: '포장마차', icon: '🍢', minStage: 'parttime', buildCost: 300, price: 5, unitCost: 2, demand: 30, maxLevel: 2, stock: 80, curve: 'meal' },
  cafe: { kind: 'cafe', name: '카페', icon: '☕', minStage: 'smallshop', buildCost: 2000, price: 6, unitCost: 1.5, demand: 40, maxLevel: 3, stock: 120, curve: 'coffee' },
  mart: { kind: 'mart', name: '편의점', icon: '🏪', minStage: 'smallshop', buildCost: 6000, price: 9, unitCost: 5, demand: 50, maxLevel: 3, stock: 160, curve: 'flat' },
  restaurant: { kind: 'restaurant', name: '식당', icon: '🍜', minStage: 'bigshop', buildCost: 15000, price: 20, unitCost: 8, demand: 32, maxLevel: 3, stock: 120, curve: 'meal' },
  boutique: { kind: 'boutique', name: '편집숍', icon: '👗', minStage: 'business', buildCost: 40000, price: 60, unitCost: 24, demand: 16, maxLevel: 3, stock: 80, curve: 'retail' },
  tech: { kind: 'tech', name: '전자제품 매장', icon: '📱', minStage: 'business', buildCost: 90000, price: 150, unitCost: 90, demand: 12, maxLevel: 3, stock: 60, curve: 'retail' },
  factory: { kind: 'factory', name: '공장', icon: '🏭', minStage: 'business', buildCost: 120000, price: 0, unitCost: 0, demand: 0, maxLevel: 3, stock: 0, curve: 'flat' },
};

/** 레벨별 손님·재고·응대 배수 */
export const LEVEL_MULT = [0, 1, 1.8, 3];
/** 레벨 N 으로 키우는 비용 = buildCost × EXPAND_COST[N] */
export const EXPAND_COST = [0, 0, 1.0, 2.0];
/** 레벨당 점원 정원 */
export const CLERKS_PER_LEVEL = 2;
/** 하루 유지비 = 건물 가치 × */
export const UPKEEP_RATE = 0.008;
/** 매니저 자동 발주 수수료 */
export const MANAGER_RESTOCK_FEE = 0.2;
/** 공장 1곳(레벨 1)당 원가 절감, 레벨 배수 적용, 최대 */
export const FACTORY_DISCOUNT = 0.06;
export const FACTORY_DISCOUNT_MAX = 0.4;
/** 매각가 = 투자금 × */
export const RESALE_RATE = 0.7;

export const WAGES = { clerk: 50, manager: 160 } as const;

export const STAFF_NAMES = ['민수', '지영', '현우', '서연', '도윤', '하은', '준호', '수빈', '태민', '유진', '성훈', '예린', '재석', '나래', '동현', '보라'];

// ── 일자리 ─────────────────────────────────────────────
export interface JobDef {
  id: string;
  name: string;
  desc: string;
  pay: number;
  energy: number;
  durationSec: number;
  /** 배달형: 다른 스폿까지 가서 완료 */
  delivery?: boolean;
  /** 근무 가능 시간 */
  fromHour: number;
  toHour: number;
}

export const JOBS: Record<string, JobDef> = {
  mart_shift: { id: 'mart_shift', name: '편의점 알바', desc: '진열하고 계산한다. 무난한 시급.', pay: 28, energy: 14, durationSec: 7, fromHour: 7, toHour: 23 },
  cafe_shift: { id: 'cafe_shift', name: '카페 알바', desc: '아침·점심 러시가 바쁘다.', pay: 34, energy: 16, durationSec: 8, fromHour: 7, toHour: 20 },
  delivery: { id: 'delivery', name: '배달 대행', desc: '물건을 받아 다른 곳까지 걸어서 배달한다. 빨리 갈수록 이득.', pay: 40, energy: 10, durationSec: 2, delivery: true, fromHour: 8, toHour: 23 },
  dock: { id: 'dock', name: '항만 하역', desc: '힘들지만 일당이 세다.', pay: 70, energy: 30, durationSec: 11, fromHour: 6, toHour: 18 },
};

/** 배달 제한 시간(게임 분) */
export const DELIVERY_MINUTES = 120;

// ── 스폿 ───────────────────────────────────────────────
const spot = (id: string, kind: SpotDef['kind'], name: string, icon: string, district: District, minStage: Stage = DISTRICTS[district].minStage): SpotDef =>
  ({ id, kind, name, icon, district, minStage });
const lot = (id: string, name: string, district: District, size: LotSize, minStage: Stage = DISTRICTS[district].minStage): SpotDef =>
  ({ id, kind: 'lot', name, icon: '🏗️', district, minStage, size });

export const SPOTS: readonly SpotDef[] = [
  // 뒷골목 — 시작 지점
  spot('bench', 'home', '공원 벤치', '🛏️', 'slum'),
  spot('alley', 'scrap', '쓰레기 골목', '🍾', 'slum'),
  spot('park', 'scrap', '어린이 공원', '🍾', 'slum'),
  spot('junkyard', 'recycle', '고물상', '♻️', 'slum'),
  spot('snack', 'food', '김밥천국', '🍙', 'slum'),
  lot('lot_s1', '골목 노점 자리', 'slum', 'S', 'parttime'),
  lot('lot_s2', '굴다리 앞 자리', 'slum', 'S', 'parttime'),
  lot('lot_s3', '뒷골목 상가', 'slum', 'M', 'parttime'),
  // 시장통
  spot('job_mart', 'job', '편의점 (알바)', '🧾', 'market', 'parttime'),
  spot('job_cafe', 'job', '카페 (알바)', '🧾', 'market', 'parttime'),
  spot('wholesale', 'market', '도매시장', '📦', 'market', 'parttime'),
  spot('bank', 'bank', '서민은행', '🏦', 'market', 'parttime'),
  lot('lot_m1', '시장 입구 자리', 'market', 'S', 'parttime'),
  lot('lot_m2', '시장 모퉁이', 'market', 'S', 'parttime'),
  lot('lot_m3', '시장 상가 1층', 'market', 'M'),
  lot('lot_m4', '시장 상가 2층', 'market', 'M'),
  // 항구
  spot('job_dock', 'job', '부두 (하역)', '🧾', 'harbor'),
  lot('lot_h1', '항구 창고 부지', 'harbor', 'I', 'business'),
  lot('lot_h2', '부두 옆 공장 부지', 'harbor', 'I', 'business'),
  lot('lot_h3', '항구 식당가', 'harbor', 'M'),
  spot('airport', 'airport', '국제공항', '✈️', 'harbor', 'corp'),
  // 도심
  spot('job_delivery', 'job', '배달 대행 사무소', '🛵', 'downtown', 'parttime'),
  spot('office', 'office', '비즈니스 센터', '🏢', 'downtown', 'bigshop'),
  lot('lot_d1', '역 앞 코너', 'downtown', 'S'),
  lot('lot_d2', '오피스 상가', 'downtown', 'M'),
  lot('lot_d3', '대로변 빌딩', 'downtown', 'L'),
  lot('lot_d4', '광장 빌딩', 'downtown', 'L', 'business'),
  // 부촌
  lot('lot_u1', '가로수길 상가', 'uptown', 'M'),
  lot('lot_u2', '명품거리 빌딩', 'uptown', 'L'),
  lot('lot_u3', '언덕 위 쇼핑몰', 'uptown', 'L', 'business'),
];

/** 라이벌 회사(가상). 게임 시작 시 일부 부지를 갖고 있고 매일 확장한다 */
export interface RivalDef { id: string; name: string; color: string; startLots: Array<[string, ShopKind]> }
export const RIVALS: readonly RivalDef[] = [
  { id: 'daebak', name: '대박유통', color: '#e0533d', startLots: [['lot_m2', 'stall'], ['lot_d2', 'mart']] },
  { id: 'gold', name: '골드체인', color: '#e6b422', startLots: [['lot_d1', 'cafe']] },
  { id: 'mega', name: '메가코프', color: '#4a7bd8', startLots: [['lot_u2', 'boutique']] },
];
/** 라이벌이 하루에 새 가게를 낼 확률 */
export const RIVAL_EXPAND_CHANCE = 0.3;
/** 라이벌이 차지할 수 있는 한 구역 부지 비율 상한 */
export const RIVAL_DISTRICT_CAP = 0.4;
/** 같은 구역 같은 업종 라이벌 1곳당 손님 감소 강도 */
export const RIVAL_PRESSURE = 0.45;
/** 같은 구역 같은 업종 내 가게끼리 손님 나눠 먹기 */
export const SELF_PRESSURE = 0.25;
export const BUYOUT_PREMIUM = 1.5;
export const TAKEOVER_PREMIUM = 1.3;

// ── 은행 ───────────────────────────────────────────────
export const LOAN_STEPS = [500, 5000, 50000, 500000];
/** 하루 이자 */
export const LOAN_RATE = 0.015;
/** 순자산 대비 대출 한도 */
export const LOAN_LIMIT_RATE = 0.6;
export const LOAN_MIN_LIMIT = 1000;

// ── 법인 ───────────────────────────────────────────────
export const INCORPORATE_COST = 25000;
/** 상장 조건 순자산 */
export const IPO_NET_WORTH = 400000;
export const IPO_MIN_SHOPS = 7;
export const IPO_MIN_DISTRICTS = 3;
/** 상장 시 유입 현금 = 순자산 × */
export const IPO_RAISE = 0.25;
/** 사업가 이상 이익에 붙는 법인세 */
export const CORP_TAX = 0.12;

// ── 해외 ───────────────────────────────────────────────
export interface RegionDef { id: string; name: string; size: number }
export const REGIONS: readonly RegionDef[] = [
  { id: 'asia', name: '아시아', size: 1_500_000 },
  { id: 'europe', name: '유럽', size: 2_000_000 },
  { id: 'namerica', name: '북미', size: 2_500_000 },
  { id: 'samerica', name: '남미', size: 1_000_000 },
  { id: 'africa', name: '아프리카', size: 800_000 },
  { id: 'oceania', name: '오세아니아', size: 600_000 },
];
export const CONQUER_SHARE = 0.6;
export const REGION_STEP = 0.1;
/** +10%p 투자 비용 = size × REGION_STEP_COST × (1 + share) */
export const REGION_STEP_COST = 0.05;
/** 하루 수입 = size × share × */
export const REGION_YIELD = 0.05;
/** 정복 전 점유율이 매일 깎이는 양(현지 경쟁) */
export const REGION_DECAY = 0.01;

// ── 이벤트 ─────────────────────────────────────────────
export interface EventDef {
  id: string;
  name: string;
  desc: string;
  days: number;
  weight: number;
  minStage: Stage;
  traffic?: number;
  /** 업종별 수요 배수 */
  kinds?: Partial<Record<ShopKind, number>>;
  costMult?: number;
  wageMult?: number;
  rivalMult?: number;
  /** 한 구역에만 적용 */
  local?: boolean;
  instant?: 'viral' | 'inspection' | 'audit' | 'windfall';
}

export const EVENTS: readonly EventDef[] = [
  { id: 'rain', name: '장맛비', desc: '거리에 사람이 줄었다. 카페만 붐빈다.', days: 1, weight: 4, minStage: 'broke', traffic: 0.75, kinds: { cafe: 1.4 } },
  { id: 'festival', name: '거리 축제', desc: '이 구역에 사람이 몰린다!', days: 2, weight: 3, minStage: 'broke', traffic: 1.6, local: true },
  { id: 'market_day', name: '장날', desc: '시장에 구경 나온 사람들로 붐빈다.', days: 1, weight: 3, minStage: 'broke', traffic: 1.35, local: true },
  { id: 'heatwave', name: '무더위', desc: '시원한 음료를 찾는 손님이 늘었다.', days: 2, weight: 2, minStage: 'smallshop', traffic: 0.9, kinds: { cafe: 1.5 } },
  { id: 'payday', name: '월급날', desc: '쇼핑을 즐기는 손님이 늘었다.', days: 1, weight: 2, minStage: 'smallshop', kinds: { mart: 1.25, boutique: 1.4, tech: 1.25 } },
  { id: 'night_market', name: '야시장 소식', desc: '먹거리 가게가 입소문을 탔다.', days: 2, weight: 2, minStage: 'parttime', kinds: { stall: 1.4, restaurant: 1.3 }, local: true },
  { id: 'boom', name: '경기 호황', desc: '다들 지갑을 연다.', days: 3, weight: 2, minStage: 'smallshop', traffic: 1.25 },
  { id: 'recession', name: '경기 침체', desc: '손님이 줄고 다들 아낀다.', days: 3, weight: 2, minStage: 'bigshop', traffic: 0.8 },
  { id: 'cost', name: '원자재 파동', desc: '재료값이 30% 올랐다.', days: 2, weight: 2, minStage: 'smallshop', costMult: 1.3 },
  { id: 'wage', name: '구인난', desc: '직원 일당이 20% 올랐다.', days: 3, weight: 1, minStage: 'smallshop', wageMult: 1.2 },
  { id: 'pricewar', name: '라이벌 가격 공세', desc: '이 구역 라이벌이 출혈 경쟁 중.', days: 2, weight: 2, minStage: 'smallshop', rivalMult: 1.8, local: true },
  { id: 'foodie', name: '먹방 열풍', desc: '먹거리 가게가 북적인다.', days: 2, weight: 2, minStage: 'smallshop', kinds: { stall: 1.5, restaurant: 1.4 } },
  { id: 'gadget', name: '신제품 출시', desc: '전자제품 매장에 줄이 섰다.', days: 2, weight: 1, minStage: 'business', kinds: { tech: 1.8 } },
  { id: 'viral', name: 'SNS 대박', desc: '가게 하나가 입소문을 탔다! 평점 +20', days: 0, weight: 2, minStage: 'smallshop', instant: 'viral' },
  { id: 'inspection', name: '위생 점검', desc: '평점 낮은 가게가 과태료를 냈다.', days: 0, weight: 2, minStage: 'smallshop', instant: 'inspection' },
  { id: 'audit', name: '세무 조사', desc: '현금의 3%를 추징당했다.', days: 0, weight: 1, minStage: 'business', instant: 'audit' },
  { id: 'windfall', name: '길에서 주운 지갑', desc: '주인을 찾아줬더니 사례금을 받았다.', days: 0, weight: 1, minStage: 'broke', instant: 'windfall' },
];
/** 하루 시작에 이벤트가 생길 확률 */
export const EVENT_CHANCE = 0.55;

// ── 단계 조건 ──────────────────────────────────────────
export const PARTTIME_EARNED = 50;
export const BUSINESS_SHOPS = 3;
