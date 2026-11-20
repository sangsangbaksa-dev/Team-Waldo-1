// 저장/불러오기. 저장 데이터는 신뢰하지 않고 기본값 위에 검증해서 얹는다.
import { BOTTLE_CAP, CARGO_CAP, CLERKS_PER_LEVEL, DISTRICTS, ENERGY_MAX, EVENTS, JOBS, LEVEL_MULT, LOT_KINDS, REGIONS, RIVALS, SHOP_KINDS, STAGES } from './data';
import { LOT_IDS, SPOT_BY_ID, newGame, type GameData, type LotData, type ShopData, type StaffData } from './model';
import type { ShopKind, Stage, TycoonCore, TycoonSave } from './types';

export const TYCOON_SAVE_KEY = 'waldo.tycoon.v1';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
const str = (v: unknown, fallback: string, max = 64) => typeof v === 'string' && v.trim() ? v.slice(0, max) : fallback;
const bool = (v: unknown, d: boolean) => typeof v === 'boolean' ? v : d;
const isKind = (v: unknown): v is ShopKind => typeof v === 'string' && Object.hasOwn(SHOP_KINDS, v);
const isStage = (v: unknown): v is Stage => typeof v === 'string' && (STAGES as readonly string[]).includes(v);

function staff(v: unknown): StaffData | null {
  if (!isObj(v) || (v.role !== 'clerk' && v.role !== 'manager')) return null;
  return { id: str(v.id, 'st0'), name: str(v.name, '직원', 12), role: v.role, skill: num(v.skill, 1, 0.7, 1.3) };
}

function shop(v: unknown): ShopData | null {
  if (!isObj(v) || !isKind(v.kind)) return null;
  const def = SHOP_KINDS[v.kind];
  const level = Math.round(num(v.level, 1, 1, def.maxLevel));
  const t = isObj(v.today) ? v.today : {};
  const list = Array.isArray(v.staff) ? v.staff.slice(0, 100).map(staff).filter((s): s is StaffData => !!s) : [];
  const unique = list.filter((s, i) => list.findIndex(other => other.id === s.id) === i);
  const clerks = unique.filter(s => s.role === 'clerk').slice(0, level * CLERKS_PER_LEVEL);
  const manager = unique.filter(s => s.role === 'manager').slice(0, 1);
  return {
    kind: v.kind, name: str(v.name, def.name, 30), level,
    priceMult: num(v.priceMult, 1, 0.5, 2), stock: num(v.stock, 0, 0, Math.round(def.stock * LEVEL_MULT[level])), rating: num(v.rating, 50, 0, 100),
    staff: v.kind === 'factory' ? [] : [...clerks, ...manager], invested: num(v.invested, def.buildCost, 0),
    today: { revenue: num(t.revenue, 0, 0), customers: num(t.customers, 0, 0), lost: num(t.lost, 0, 0), cost: num(t.cost, 0, 0) },
    lastProfit: num(v.lastProfit, 0), busy: num(v.busy, 0, 0, 1),
  };
}

function lot(id: string, v: unknown, fallback: LotData): LotData {
  if (!isObj(v)) return fallback;
  if (v.owner === 'player') {
    const s = shop(v.shop);
    const size = SPOT_BY_ID.get(id)?.size;
    return s && size && LOT_KINDS[size].includes(s.kind) ? { owner: 'player', shop: s } : { owner: 'none' };
  }
  const size = SPOT_BY_ID.get(id)?.size;
  if (v.owner === 'rival' && typeof v.rivalId === 'string' && RIVALS.some(r => r.id === v.rivalId) && isKind(v.rivalKind) && size && LOT_KINDS[size].includes(v.rivalKind) && v.rivalKind !== 'factory') {
    return { owner: 'rival', rivalId: v.rivalId, rivalKind: v.rivalKind, rivalLevel: Math.round(num(v.rivalLevel, 1, 1, SHOP_KINDS[v.rivalKind].maxLevel)) };
  }
  return { owner: 'none' };
}

/** 어떤 값이든 받아 올바른 GameData 로 만든다. 알 수 없는 필드는 버린다 */
export function restoreGame(raw: unknown): GameData | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const g = newGame(num(raw.rng, 1));
  g.cash = num(raw.cash, 0, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  g.stage = isStage(raw.stage) ? raw.stage : 'broke';
  g.day = Math.round(num(raw.day, 1, 1));
  g.minute = Math.floor(num(raw.minute, g.minute, 0, 1439));
  g.rng = (num(raw.rng, 1) >>> 0) || 1;
  g.debt = num(raw.debt, 0, 0, Number.MAX_SAFE_INTEGER);
  if (g.cash < 0) { g.debt = Math.min(Number.MAX_SAFE_INTEGER, g.debt - g.cash); g.cash = 0; }
  g.energy = num(raw.energy, ENERGY_MAX, 0, ENERGY_MAX);
  g.bottles = Math.floor(num(raw.bottles, 0, 0, BOTTLE_CAP));
  g.cargo = isObj(raw.cargo) && isKind(raw.cargo.kind) && raw.cargo.kind !== 'factory' ? { kind: raw.cargo.kind, units: Math.floor(num(raw.cargo.units, 0, 0, CARGO_CAP)) } : null;
  if (g.cargo && g.cargo.units <= 0) g.cargo = null;
  g.lifetimeEarned = num(raw.lifetimeEarned, 0, 0);
  g.jobsDone = Math.floor(num(raw.jobsDone, 0, 0));
  if (isObj(raw.scrap)) for (const k of Object.keys(g.scrap)) g.scrap[k] = num(raw.scrap[k], g.scrap[k], 0, 12);
  const lots = isObj(raw.lots) ? raw.lots : {};
  for (const id of LOT_IDS) g.lots[id] = lot(id, lots[id], g.lots[id]);
  if (isObj(raw.rivals)) for (const r of RIVALS) g.rivals[r.id] = { acquired: isObj(raw.rivals[r.id]) && raw.rivals[r.id] !== null && bool((raw.rivals[r.id] as Obj).acquired, false) };
  for (const r of RIVALS) if (g.rivals[r.id].acquired) for (const id of LOT_IDS) if (g.lots[id].rivalId === r.id) g.lots[id] = { owner: 'none' };
  if (isObj(raw.regions)) for (const r of REGIONS) g.regions[r.id] = num(raw.regions[r.id], 0, 0, 1);
  if (Array.isArray(raw.events)) for (const e of raw.events.slice(0, 100)) {
    if (!isObj(e) || typeof e.id !== 'string' || g.events.some(active => active.id === e.id)) continue;
    const def = EVENTS.find(d => d.id === e.id && !d.instant);
    if (!def) continue;
    const district = typeof e.district === 'string' && Object.hasOwn(DISTRICTS, e.district) ? e.district as GameData['events'][number]['district'] : undefined;
    const daysLeft = Math.floor(num(e.daysLeft, 0, 0, def.days));
    if (daysLeft > 0 && (!def.local || district)) g.events.push({ id: def.id, daysLeft, district });
  }
  g.incorporated = bool(raw.incorporated, false);
  g.listed = bool(raw.listed, false) && g.incorporated;
  g.won = bool(raw.won, false);
  const t = raw.task;
  g.task = isObj(t) && t.jobId === 'delivery' && t.from === 'job_delivery' && typeof t.target === 'string' && t.target !== t.from && SPOT_BY_ID.has(t.target)
    ? { id: str(t.id, 'task-restored'), jobId: 'delivery', from: 'job_delivery', target: t.target, reward: JOBS.delivery.pay, deadline: num(t.deadline, 0, 0) }
    : null;
  if (isObj(raw.lastReport)) {
    const r = raw.lastReport;
    g.lastReport = { day: Math.floor(num(r.day, 1, 1, g.day)), revenue: num(r.revenue, 0, 0), costOfGoods: num(r.costOfGoods, 0, 0), wages: num(r.wages, 0, 0), upkeep: num(r.upkeep, 0, 0), interest: num(r.interest, 0, 0), tax: num(r.tax, 0, 0), worldIncome: num(r.worldIncome, 0, 0), jobIncome: num(r.jobIncome, 0, 0), profit: num(r.profit, 0), customers: num(r.customers, 0, 0), lost: num(r.lost, 0, 0) };
  }
  if (isObj(raw.ledger)) for (const k of Object.keys(g.ledger) as Array<keyof GameData['ledger']>) g.ledger[k] = num(raw.ledger[k], 0);
  let usedId = 0;
  for (const id of LOT_IDS) for (const s of g.lots[id].shop?.staff ?? []) { const n = /^st(\d+)$/.exec(s.id); if (n && Number.isSafeInteger(Number(n[1])) && Number(n[1]) < Number.MAX_SAFE_INTEGER - 1) usedId = Math.max(usedId, Number(n[1])); }
  const taskId = /^task(\d+)$/.exec(g.task?.id ?? '');
  if (taskId && Number.isSafeInteger(Number(taskId[1])) && Number(taskId[1]) < Number.MAX_SAFE_INTEGER - 1) usedId = Math.max(usedId, Number(taskId[1]));
  g.nextId = Math.max(usedId + 1, Math.floor(num(raw.nextId, 1, 1, Number.MAX_SAFE_INTEGER - 1)));
  g.shopsOpened = Math.floor(num(raw.shopsOpened, 0, 0));
  return g;
}

export function serializeGame(g: GameData): TycoonSave {
  return JSON.parse(JSON.stringify(g)) as TycoonSave;
}

function store(storage?: Storage): Storage | null {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}

/** 저장된 판을 읽는다(없거나 깨졌으면 null) */
export function loadTycoon(storage?: Storage): unknown {
  try {
    const raw = store(storage)?.getItem(TYCOON_SAVE_KEY);
    return raw ? JSON.parse(raw) as unknown : null;
  } catch { return null; }
}

/** 화면 상태는 경제 저장과 독립적으로 선택 저장한다. 기존 v1 저장도 읽을 수 있다. */
export interface TycoonPosition {
  x: number;
  z: number;
  facing: number;
  yaw: number;
  pitch: number;
  distance: number;
  firstPerson: boolean;
}

export function readTycoonPosition(raw: unknown): TycoonPosition | null {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.position)) return null;
  const p = raw.position;
  if (typeof p.x !== 'number' || !Number.isFinite(p.x) || typeof p.z !== 'number' || !Number.isFinite(p.z)) return null;
  return {
    x: p.x, z: p.z,
    facing: num(p.facing ?? p.yaw, 0, -Math.PI * 2, Math.PI * 2),
    yaw: num(p.cameraYaw ?? p.yaw, 0, -Math.PI * 2, Math.PI * 2),
    pitch: num(p.pitch ?? p.cameraPitch, 0.28, -1.3, 1.3),
    distance: num(p.distance, 7.5, 3.5, 14),
    firstPerson: bool(p.firstPerson, false),
  };
}

export function saveTycoon(core: Pick<TycoonCore, 'serialize'>, storage?: Storage, position?: TycoonPosition): boolean {
  try {
    const target = store(storage); if (!target) return false;
    const state = core.serialize();
    target.setItem(TYCOON_SAVE_KEY, JSON.stringify(position ? { ...state, position } : state));
    return true;
  } catch { return false; }
}

export function clearTycoon(storage?: Storage): void {
  try { store(storage)?.removeItem(TYCOON_SAVE_KEY); } catch { /* 무시 */ }
}

/** 허브 카드용: 게임 본체 없이 저장 요약만 읽는다 */
export function readTycoonSummary(storage?: Storage): { has: boolean; cash: number; stage: Stage; day: number; won: boolean } {
  const raw = loadTycoon(storage);
  if (!isObj(raw) || raw.v !== 1) return { has: false, cash: 0, stage: 'broke', day: 1, won: false };
  return { has: true, cash: num(raw.cash, 0), stage: isStage(raw.stage) ? raw.stage : 'broke', day: Math.round(num(raw.day, 1, 1)), won: bool(raw.won, false) };
}
