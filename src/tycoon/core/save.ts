// 저장/불러오기. 저장 데이터는 신뢰하지 않고 기본값 위에 검증해서 얹는다.
import { ENERGY_MAX, REGIONS, RIVALS, SHOP_KINDS, STAGES } from './data';
import { LOT_IDS, SPOT_BY_ID, newGame, type GameData, type LotData, type ShopData, type StaffData } from './model';
import type { ShopKind, Stage, TycoonCore, TycoonSave } from './types';

import { TYCOON_SAVE_KEY } from './summary';
export { TYCOON_SAVE_KEY, readTycoonSummary } from './summary';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
const bool = (v: unknown, d: boolean) => typeof v === 'boolean' ? v : d;
const isKind = (v: unknown): v is ShopKind => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SHOP_KINDS, v);
const isStage = (v: unknown): v is Stage => typeof v === 'string' && (STAGES as readonly string[]).includes(v);

function staff(v: unknown): StaffData | null {
  if (!isObj(v) || (v.role !== 'clerk' && v.role !== 'manager')) return null;
  return { id: String(v.id ?? 'st0'), name: String(v.name ?? '직원').slice(0, 12), role: v.role, skill: num(v.skill, 1, 0.7, 1.3) };
}

function shop(v: unknown): ShopData | null {
  if (!isObj(v) || !isKind(v.kind)) return null;
  const def = SHOP_KINDS[v.kind];
  const level = Math.round(num(v.level, 1, 1, def.maxLevel));
  const t = isObj(v.today) ? v.today : {};
  const list = Array.isArray(v.staff) ? v.staff.map(staff).filter((s): s is StaffData => !!s) : [];
  const clerks = list.filter(s => s.role === 'clerk').slice(0, level * 2);
  const manager = list.filter(s => s.role === 'manager').slice(0, 1);
  return {
    kind: v.kind, name: String(v.name ?? def.name).slice(0, 30), level,
    priceMult: num(v.priceMult, 1, 0.5, 2), stock: num(v.stock, 0, 0, def.stock * 3), rating: num(v.rating, 50, 0, 100),
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
    return s && size ? { owner: 'player', shop: s } : { owner: 'none' };
  }
  if (v.owner === 'rival' && RIVALS.some(r => r.id === v.rivalId) && isKind(v.rivalKind)) {
    return { owner: 'rival', rivalId: String(v.rivalId), rivalKind: v.rivalKind, rivalLevel: Math.round(num(v.rivalLevel, 1, 1, 3)) };
  }
  return { owner: 'none' };
}

/** 어떤 값이든 받아 올바른 GameData 로 만든다. 알 수 없는 필드는 버린다 */
export function restoreGame(raw: unknown): GameData | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const g = newGame(num(raw.rng, 1));
  g.cash = num(raw.cash, 0);
  g.stage = isStage(raw.stage) ? raw.stage : 'broke';
  g.day = Math.round(num(raw.day, 1, 1));
  g.minute = Math.floor(num(raw.minute, g.minute, 0, 1439));
  g.rng = (num(raw.rng, 1) >>> 0) || 1;
  g.debt = num(raw.debt, 0, 0);
  g.energy = num(raw.energy, ENERGY_MAX, 0, ENERGY_MAX);
  g.bottles = Math.floor(num(raw.bottles, 0, 0, 30));
  g.cargo = isObj(raw.cargo) && isKind(raw.cargo.kind) ? { kind: raw.cargo.kind, units: Math.floor(num(raw.cargo.units, 0, 0, 60)) } : null;
  if (g.cargo && g.cargo.units <= 0) g.cargo = null;
  g.lifetimeEarned = num(raw.lifetimeEarned, 0, 0);
  g.jobsDone = Math.floor(num(raw.jobsDone, 0, 0));
  if (isObj(raw.scrap)) for (const k of Object.keys(g.scrap)) g.scrap[k] = num(raw.scrap[k], g.scrap[k], 0, 12);
  const lots = isObj(raw.lots) ? raw.lots : {};
  for (const id of LOT_IDS) g.lots[id] = lot(id, lots[id], g.lots[id]);
  if (isObj(raw.rivals)) for (const r of RIVALS) g.rivals[r.id] = { acquired: isObj(raw.rivals[r.id]) && raw.rivals[r.id] !== null && bool((raw.rivals[r.id] as Obj).acquired, false) };
  for (const r of RIVALS) if (g.rivals[r.id].acquired) for (const id of LOT_IDS) if (g.lots[id].rivalId === r.id) g.lots[id] = { owner: 'none' };
  if (isObj(raw.regions)) for (const r of REGIONS) g.regions[r.id] = num(raw.regions[r.id], 0, 0, 1);
  g.events = Array.isArray(raw.events) ? raw.events.filter(isObj).map(e => ({ id: String(e.id), daysLeft: Math.round(num(e.daysLeft, 0, 0, 5)), district: typeof e.district === 'string' ? e.district as GameData['events'][number]['district'] : undefined })).filter(e => e.daysLeft > 0) : [];
  g.incorporated = bool(raw.incorporated, false);
  g.listed = bool(raw.listed, false) && g.incorporated;
  g.won = bool(raw.won, false);
  const t = raw.task;
  g.task = isObj(t) && SPOT_BY_ID.has(String(t.target)) && SPOT_BY_ID.has(String(t.from))
    ? { id: String(t.id), jobId: String(t.jobId), from: String(t.from), target: String(t.target), reward: num(t.reward, 0, 0, 1000), deadline: num(t.deadline, 0) }
    : null;
  g.lastReport = isObj(raw.lastReport) ? raw.lastReport as unknown as GameData['lastReport'] : null;
  if (isObj(raw.ledger)) for (const k of Object.keys(g.ledger) as Array<keyof GameData['ledger']>) g.ledger[k] = num(raw.ledger[k], 0);
  g.nextId = Math.floor(num(raw.nextId, 1, 1));
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

export function saveTycoon(core: Pick<TycoonCore, 'serialize'>, storage?: Storage): boolean {
  try { const target = store(storage); if (!target) return false; target.setItem(TYCOON_SAVE_KEY, JSON.stringify(core.serialize())); return true; } catch { return false; }
}

export function clearTycoon(storage?: Storage): void {
  try { store(storage)?.removeItem(TYCOON_SAVE_KEY); } catch { /* 무시 */ }
}
