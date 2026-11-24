// 내부 상태(저장되는 그대로의 모양)와 경제 계산 도우미.
import {
  CLERK_SERVE_PER_MIN, DISTRICTS, EVENTS, EXPAND_COST, FACTORY_DISCOUNT, FACTORY_DISCOUNT_MAX, LEVEL_MULT, LOT_SIZE_MULT,
  OWNER_SERVE_PER_MIN, REGIONS, RESALE_RATE, RIVALS, SHOP_KINDS, SPOTS, START_MINUTE, STAFF_NAMES, ENERGY_MAX,
} from './data';
import type { DayReport, District, ShopKind, SpotDef, Stage } from './types';

export interface StaffData { id: string; name: string; role: 'clerk' | 'manager'; skill: number }

export interface ShopData {
  kind: ShopKind;
  name: string;
  level: number;
  priceMult: number;
  stock: number;
  rating: number;
  staff: StaffData[];
  /** 부지+건물+확장에 쓴 돈 */
  invested: number;
  today: { revenue: number; customers: number; lost: number; cost: number };
  /** 어제 기준 순이익 */
  lastProfit: number;
  /** 최근 분당 수요/응대량(혼잡도 표시용) */
  busy: number;
}

export interface LotData {
  owner: 'none' | 'player' | 'rival';
  rivalId?: string;
  rivalKind?: ShopKind;
  rivalLevel?: number;
  shop?: ShopData;
}

export interface ActiveEvent { id: string; daysLeft: number; district?: District }

export interface TaskData { id: string; jobId: string; from: string; target: string; reward: number; deadline: number }

export interface ActivityData { spotId: string; actionId: string; label: string; elapsed: number; duration: number; lockMovement: boolean }

export type Ledger = Omit<DayReport, 'day' | 'profit'>;

export interface GameData {
  v: 1;
  /** 허브 카드용 최상위 필드 */
  cash: number;
  stage: Stage;
  day: number;
  minute: number;
  rng: number;
  debt: number;
  energy: number;
  bottles: number;
  cargo: { kind: ShopKind; units: number } | null;
  lifetimeEarned: number;
  jobsDone: number;
  scrap: Record<string, number>;
  lots: Record<string, LotData>;
  rivals: Record<string, { acquired: boolean }>;
  regions: Record<string, number>;
  events: ActiveEvent[];
  incorporated: boolean;
  listed: boolean;
  won: boolean;
  task: TaskData | null;
  ledger: Ledger;
  lastReport: DayReport | null;
  nextId: number;
  shopsOpened: number;
  /** 진행 중인 일. 없는 저장은 이어지지 않는다. */
  activity: ActivityData | null;
}

export const SPOT_BY_ID: ReadonlyMap<string, SpotDef> = new Map(SPOTS.map(s => [s.id, s]));
export const LOT_IDS: readonly string[] = SPOTS.filter(s => s.kind === 'lot').map(s => s.id);
export const SCRAP_MAX = 12;

export function emptyLedger(): Ledger {
  return { revenue: 0, costOfGoods: 0, wages: 0, upkeep: 0, interest: 0, tax: 0, worldIncome: 0, jobIncome: 0, customers: 0, lost: 0 };
}

export function newGame(seed = Date.now()): GameData {
  const lots: Record<string, LotData> = {};
  for (const id of LOT_IDS) lots[id] = { owner: 'none' };
  for (const r of RIVALS) for (const [lotId, kind] of r.startLots) lots[lotId] = { owner: 'rival', rivalId: r.id, rivalKind: kind, rivalLevel: 1 };
  const scrap: Record<string, number> = {};
  for (const s of SPOTS) if (s.kind === 'scrap') scrap[s.id] = SCRAP_MAX;
  return {
    v: 1,
    cash: 0,
    stage: 'broke',
    day: 1,
    minute: START_MINUTE,
    rng: (seed >>> 0) || 1,
    debt: 0,
    energy: ENERGY_MAX,
    bottles: 0,
    cargo: null,
    lifetimeEarned: 0,
    jobsDone: 0,
    scrap,
    lots,
    rivals: Object.fromEntries(RIVALS.map(r => [r.id, { acquired: false }])),
    regions: Object.fromEntries(REGIONS.map(r => [r.id, 0])),
    events: [],
    incorporated: false,
    listed: false,
    won: false,
    task: null,
    ledger: emptyLedger(),
    lastReport: null,
    nextId: 1,
    shopsOpened: 0,
    activity: null,
  };
}

// ── 난수(mulberry32, 상태는 저장된다) ────────────────
export function rand(g: GameData): number {
  let t = (g.rng = (g.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function pick<T>(g: GameData, list: readonly T[]): T { return list[Math.floor(rand(g) * list.length)]; }

export function nextId(g: GameData, prefix: string): string { return `${prefix}${g.nextId++}`; }

export function makeStaff(g: GameData, role: StaffData['role']): StaffData {
  const skill = Math.round((0.7 + rand(g) * 0.6) * 100) / 100;
  return { id: nextId(g, 'st'), name: pick(g, STAFF_NAMES), role, skill };
}

// ── 시간 ─────────────────────────────────────────────
export function hourOf(g: GameData): number { return g.minute / 60; }
export function absMinute(g: GameData): number { return (g.day - 1) * 1440 + g.minute; }
export function clock(minute: number): string {
  const h = Math.floor(minute / 60) % 24, m = Math.floor(minute % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── 이벤트 배수 ─────────────────────────────────────
function activeDefs(g: GameData) {
  return g.events.map(e => ({ e, def: EVENTS.find(d => d.id === e.id)! })).filter(x => x.def);
}
export function trafficMult(g: GameData, district: District): number {
  let m = 1;
  for (const { e, def } of activeDefs(g)) if (def.traffic && (!def.local || e.district === district)) m *= def.traffic;
  return m;
}
export function kindMult(g: GameData, kind: ShopKind): number {
  let m = 1;
  for (const { def } of activeDefs(g)) m *= def.kinds?.[kind] ?? 1;
  return m;
}
export function costMult(g: GameData): number {
  let m = 1;
  for (const { def } of activeDefs(g)) m *= def.costMult ?? 1;
  return m;
}
export function wageMult(g: GameData): number {
  let m = 1;
  for (const { def } of activeDefs(g)) m *= def.wageMult ?? 1;
  return m;
}
export function rivalMult(g: GameData, district: District): number {
  let m = 1;
  for (const { e, def } of activeDefs(g)) if (def.rivalMult && (!def.local || e.district === district)) m *= def.rivalMult;
  return m;
}

// ── 가게 계산 ───────────────────────────────────────
export function lotPrice(spot: SpotDef): number {
  return Math.round(DISTRICTS[spot.district].landPrice * LOT_SIZE_MULT[spot.size ?? 'S']);
}
/** 레벨 1 → level 까지 짓는 데 드는 건축비 합 */
export function buildTotal(kind: ShopKind, level: number): number {
  const b = SHOP_KINDS[kind].buildCost;
  let sum = b;
  for (let l = 2; l <= level; l++) sum += b * EXPAND_COST[l];
  return sum;
}
export function expandCost(shop: ShopData): number {
  return Math.round(SHOP_KINDS[shop.kind].buildCost * EXPAND_COST[shop.level + 1]);
}
export function stockCap(shop: ShopData): number { return Math.round(SHOP_KINDS[shop.kind].stock * LEVEL_MULT[shop.level]); }
export function shopValue(shop: ShopData): number { return Math.round(shop.invested * RESALE_RATE); }

export function factoryDiscount(g: GameData): number {
  let d = 0;
  for (const lot of Object.values(g.lots)) if (lot.owner === 'player' && lot.shop?.kind === 'factory') d += FACTORY_DISCOUNT * LEVEL_MULT[lot.shop.level];
  return Math.min(FACTORY_DISCOUNT_MAX, d);
}
/** 재고 1개를 사오는 값(이벤트·공장 반영) */
export function unitCost(g: GameData, kind: ShopKind): number {
  return SHOP_KINDS[kind].unitCost * costMult(g) * (1 - factoryDiscount(g));
}

export function rivalShopValue(spot: SpotDef, kind: ShopKind, level: number): number {
  return Math.round((lotPrice(spot) + buildTotal(kind, level)) * RESALE_RATE);
}

/** 사장 포함 분당 응대 능력 */
export function serveCapacity(shop: ShopData, ownerHere: boolean): number {
  let c = ownerHere ? OWNER_SERVE_PER_MIN : 0;
  for (const s of shop.staff) c += (s.role === 'clerk' ? CLERK_SERVE_PER_MIN : CLERK_SERVE_PER_MIN * 0.5) * s.skill;
  return c * (1 + (shop.level - 1) * 0.25);
}

/** 시간대별 수요 곡선(하루 평균이 대략 1) */
export function demandCurve(curve: 'meal' | 'coffee' | 'retail' | 'flat', hour: number): number {
  const bump = (c: number, w: number) => Math.exp(-((hour - c) ** 2) / (2 * w * w));
  switch (curve) {
    case 'meal': return 0.45 + 1.3 * bump(12.5, 1.3) + 1.5 * bump(19, 1.6);
    case 'coffee': return 0.5 + 1.4 * bump(8.5, 1.2) + 1.0 * bump(14, 1.8);
    case 'retail': return 0.35 + 1.1 * bump(15.5, 3.5);
    default: return 1;
  }
}

export function playerShops(g: GameData): Array<{ id: string; spot: SpotDef; shop: ShopData }> {
  const out: Array<{ id: string; spot: SpotDef; shop: ShopData }> = [];
  for (const id of LOT_IDS) {
    const lot = g.lots[id];
    if (lot.owner === 'player' && lot.shop) out.push({ id, spot: SPOT_BY_ID.get(id)!, shop: lot.shop });
  }
  return out;
}

export function retailShops(g: GameData) { return playerShops(g).filter(s => s.shop.kind !== 'factory'); }

export function regionValue(g: GameData): number {
  let v = 0;
  for (const r of REGIONS) v += r.size * (g.regions[r.id] ?? 0) * 0.5;
  return v;
}

export function netWorth(g: GameData): number {
  let v = g.cash - g.debt + regionValue(g);
  for (const { shop } of playerShops(g)) v += shopValue(shop) + shop.stock * SHOP_KINDS[shop.kind].unitCost;
  if (g.cargo) v += g.cargo.units * SHOP_KINDS[g.cargo.kind].unitCost;
  return Math.round(v);
}

export function earn(g: GameData, amount: number): void {
  g.cash += amount;
  if (amount > 0) g.lifetimeEarned += amount;
}
