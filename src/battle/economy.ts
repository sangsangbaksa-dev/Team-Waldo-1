/** Deterministic civil economy. Runtime dependencies stay outside the renderer. */
import { z } from 'zod';
import type { War } from './war';

export type Job = 'mine' | 'farm' | 'trade' | 'idle';
export type Infrastructure = 'city' | 'warehouse' | 'market' | 'port';
export type Tax = 'low' | 'balanced' | 'high';
export const JOBS: Record<Job, string> = { mine: '금광', farm: '농장', trade: '상업', idle: '대기' };
export const INFRASTRUCTURE: Record<Infrastructure, { label: string; description: string; gold: number; food: number; seconds: number; max: number }> = {
  city: { label: '도시', description: '단계마다 인구 한도 +6 · 시민 세수', gold: 140, food: 90, seconds: 25, max: 4 },
  warehouse: { label: '창고', description: '단계마다 금·식량 저장량 +1,000', gold: 80, food: 40, seconds: 15, max: 3 },
  market: { label: '시장', description: '상인 수입 · 수출과 납품 계약 해금', gold: 110, food: 60, seconds: 20, max: 3 },
  port: { label: '무역항', description: '도시 Lv.2 · 시장 필요 · 해상 수출 해금', gold: 200, food: 120, seconds: 30, max: 1 },
};
export const TAXES: Record<Tax, { label: string; multiplier: number; happiness: number }> = {
  low: { label: '감세', multiplier: .5, happiness: .2 },
  balanced: { label: '보통', multiplier: 1, happiness: 0 },
  high: { label: '중과세', multiplier: 1.8, happiness: -.3 },
};
export const ROUTES = {
  caravan: { label: '육상 곡물 교역', food: 40, gold: 58, seconds: 20, port: false },
  overseas: { label: '해외 곡물 수출', food: 100, gold: 180, seconds: 35, port: true },
} as const;
export type Route = keyof typeof ROUTES;
export const CONTRACTS = {
  provisions: { label: '상단 식량 조달', resource: 'food', amount: 120, gold: 210, food: 0, seconds: 75, market: 1, deposit: 20 },
  bullion: { label: '도시 재건 투자', resource: 'gold', amount: 160, gold: 0, food: 240, seconds: 90, market: 1, deposit: 20 },
  harvest: { label: '왕실 곡물 납품', resource: 'food', amount: 260, gold: 480, food: 0, seconds: 100, market: 2, deposit: 40 },
} as const;
export type Contract = keyof typeof CONTRACTS;
export interface KingdomEconomy {
  city: number; warehouse: number; market: number; port: number;
  workers: Record<Job, number>; tax: Tax; happiness: number; reputation: number;
  construction: { key: Infrastructure; remaining: number } | null;
  shipment: { route: Route; remaining: number; reward: number; loads: number } | null;
  contract: { key: Contract; deadline: number; escrow?: number; legacy?: boolean } | null;
  exportReadyAt?: number;
  availableAt: Record<Contract, number>;
  exports: number; completed: number; failed: number; tradeGold: number;
}
export function createEconomy(): KingdomEconomy {
  return { city: 1, warehouse: 0, market: 0, port: 0, workers: { mine: 6, farm: 6, trade: 0, idle: 0 },
    tax: 'balanced', happiness: 70, reputation: 50, construction: null, shipment: null, contract: null,
    availableAt: { provisions: 0, bullion: 0, harvest: 0 }, exports: 0, completed: 0, failed: 0, tradeGold: 0 };
}
export const population = (e: KingdomEconomy) => Object.values(e.workers).reduce((a, b) => a + b, 0);
export const populationCap = (e: KingdomEconomy) => 12 + e.city * 6;
export const storageCap = (w: War, id: number) => (w.grandBattle ? 10000 : 1200) + w.economy[id].warehouse * 1000;
export const taxIncome = (e: KingdomEconomy) => Math.max(0, population(e) - 12) * .18 * TAXES[e.tax].multiplier;
export const foodUpkeep = (e: KingdomEconomy) => Math.max(0, population(e) - 12) * .12;
export const productivity = (e: KingdomEconomy) => Math.max(.65, Math.min(1.1, 1 + (e.happiness - 70) / 200));
const usable = (w: War, id: number) => !w.over && Boolean(w.factions[id]?.alive && w.factions[id].hp > 0 && w.economy[id]);
function report(w: War, id: number, message: string): void {
  w.events.unshift({ time: Math.floor(w.time), text: `${id === 0 ? '나' : ['나', '적색', '황색', '보라'][id]} 세력 ${message}` });
  w.events.length = Math.min(w.events.length, 8);
}
export function assignWorker(w: War, id: number, job: Exclude<Job, 'idle'>, change: number): boolean {
  if (!usable(w, id) || !['mine', 'farm', 'trade'].includes(job) || (change !== 1 && change !== -1)) return false;
  const e = w.economy[id];
  if (change === 1 && (e.workers.idle === 0 || (job === 'trade' && e.market === 0))) return false;
  if (change === -1 && e.workers[job] === 0) return false;
  e.workers[job] += change; e.workers.idle -= change; return true;
}
export function recruitWorker(w: War, id: number): boolean {
  if (!usable(w, id)) return false;
  const f = w.factions[id], e = w.economy[id];
  if (population(e) >= populationCap(e) || f.gold < 20 || f.food < 30) return false;
  f.gold -= 20; f.food -= 30; e.workers.idle++; return true;
}
export function setTax(w: War, id: number, tax: Tax): boolean {
  if (!usable(w, id) || !Object.hasOwn(TAXES, tax)) return false;
  w.economy[id].tax = tax; return true;
}
export function infrastructureCost(e: KingdomEconomy, key: Infrastructure) {
  const def = INFRASTRUCTURE[key], level = key === 'city' ? e[key] : e[key] + 1;
  return { gold: def.gold * level, food: def.food * level, seconds: def.seconds * level };
}
export function constructionRequirement(e: KingdomEconomy, key: Infrastructure): string {
  if (e[key] >= INFRASTRUCTURE[key].max) return '최대 단계';
  if (e.construction) return '다른 시설 건설 중';
  if (key === 'port' && (e.city < 2 || e.market < 1)) return '도시 Lv.2 · 시장 Lv.1 필요';
  return '';
}
export function construct(w: War, id: number, key: Infrastructure): boolean {
  if (!usable(w, id) || !Object.hasOwn(INFRASTRUCTURE, key)) return false;
  const e = w.economy[id], f = w.factions[id], cost = infrastructureCost(e, key);
  if (constructionRequirement(e, key) || f.gold < cost.gold || f.food < cost.food) return false;
  f.gold -= cost.gold; f.food -= cost.food; e.construction = { key, remaining: cost.seconds };
  report(w, id, `${INFRASTRUCTURE[key].label} 건설 시작`); return true;
}
function credit(w: War, id: number, gold: number, food: number): void {
  const f = w.factions[id], cap = storageCap(w, id);
  const earnedGold = Math.min(gold, Math.max(0, cap - f.gold)), earnedFood = Math.min(food, Math.max(0, cap - f.food));
  f.gold += earnedGold; f.food += earnedFood;
  w.stats[id].goldEarned += earnedGold; w.stats[id].foodEarned += earnedFood;
  w.economy[id].tradeGold += earnedGold;
}
export function cancelConstruction(w: War, id: number): boolean {
  if (!usable(w, id) || !w.economy[id].construction) return false;
  const e = w.economy[id], cost = infrastructureCost(e, e.construction!.key), f = w.factions[id], cap = storageCap(w, id);
  // Refunds are not newly earned income.
  f.gold += Math.min(cost.gold * .75, Math.max(0, cap - f.gold));
  f.food += Math.min(cost.food * .75, Math.max(0, cap - f.food));
  e.construction = null; return true;
}
export function routeRequirement(w: War, id: number, route: Route, loads = 1): string {
  const e = w.economy[id];
  if (e.market < 1) return '시장 Lv.1 필요';
  if (e.market < loads) return `시장 Lv.${loads} 필요`;
  if (e.workers.trade < loads) return `상인 ${loads}명 필요`;
  if (ROUTES[route].port && (!e.port || !w.outposts.some(p => (p.id === 3 || p.id === 8) && p.owner === id))) return '무역항 + 서부 항구/남동부 교역소 점령 필요';
  return '';
}

/** Use a secured sea gateway and share convoy positions between 3D and the minimap. */
export function exportDestination(w: War, id: number, route: Route): { x: number; z: number; id: number } {
  return route === 'caravan' ? w.outposts[1] : w.outposts.find(p => (p.id === 3 || p.id === 8) && p.owner === id) ?? w.outposts[3];
}
export function exportPosition(w: War, id: number): { x: number; z: number } | null {
  const shipment = w.economy[id].shipment;
  if (!shipment) return null;
  const from = w.factions[id], to = exportDestination(w, id, shipment.route);
  const t = Math.max(0, Math.min(1, 1 - shipment.remaining / ROUTES[shipment.route].seconds));
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

export const exportReward = (e: KingdomEconomy, route: Route) => Math.round(ROUTES[route].gold * (.8 + e.reputation * .004));
export function dispatchExport(w: War, id: number, route: Route, loads = 1): boolean {
  if (!usable(w, id) || !Object.hasOwn(ROUTES, route) || !Number.isInteger(loads) || loads < 1 || loads > 3) return false;
  const e = w.economy[id], f = w.factions[id], def = ROUTES[route];
  if (e.shipment || (e.exportReadyAt ?? 0) > w.time || routeRequirement(w, id, route, loads) || f.food < def.food * loads) return false;
  f.food -= def.food * loads; e.shipment = { route, remaining: def.seconds, reward: exportReward(e, route) * loads, loads };
  report(w, id, `${def.label} 출발`); return true;
}
export function acceptContract(w: War, id: number, key: Contract): boolean {
  if (!usable(w, id) || !Object.hasOwn(CONTRACTS, key)) return false;
  const e = w.economy[id], f = w.factions[id], def = CONTRACTS[key];
  if (e.contract || e.market < def.market || e.availableAt[key] > w.time || f.gold < def.deposit) return false;
  f.gold -= def.deposit; e.contract = { key, deadline: w.time + def.seconds };
  report(w, id, `${def.label} 계약 체결`); return true;
}
export function fulfillContract(w: War, id: number): boolean {
  if (!usable(w, id)) return false;
  const e = w.economy[id], f = w.factions[id], active = e.contract;
  if (!active || w.time >= active.deadline) return false;
  const def = CONTRACTS[active.key];
  if (f[def.resource] < def.amount) return false;
  f[def.resource] -= def.amount;
  // Return the escrow separately; it is not trade revenue.
  f.gold += Math.min(active.escrow ?? def.deposit, Math.max(0, storageCap(w, id) - f.gold));
  credit(w, id, def.gold, def.food);
  e.reputation = Math.min(100, e.reputation + 10); e.completed++;
  e.availableAt[active.key] = w.time + 120; e.contract = null;
  report(w, id, `${def.label} 납품 완료 · 평판 +10`); return true;
}
export function stepEconomy(w: War, id: number, dt: number): void {
  const f = w.factions[id], e = w.economy[id];
  if (!f.alive || f.hp <= 0) return;
  const shortage = f.food <= .001 && foodUpkeep(e) > 0;
  e.happiness = Math.max(20, Math.min(100, e.happiness + (TAXES[e.tax].happiness - (shortage ? 1 : 0)) * dt));
  if (e.construction) {
    e.construction.remaining = Math.max(0, e.construction.remaining - dt);
    if (e.construction.remaining < 1e-7) {
      const key = e.construction.key; e[key]++; e.construction = null; w.stats[id].upgrades++;
      report(w, id, `${INFRASTRUCTURE[key].label} Lv.${e[key]} 건설 완료`);
    }
  }
  if (e.shipment && !routeRequirement(w, id, e.shipment.route, e.shipment.loads)) {
    e.shipment.remaining = Math.max(0, e.shipment.remaining - dt);
    if (e.shipment.remaining < 1e-7) {
      credit(w, id, e.shipment.reward, 0); e.exports++; e.shipment = null;
      report(w, id, '수출 대금 도착');
    }
  }
  if (e.contract && w.time >= e.contract.deadline) {
    e.availableAt[e.contract.key] = w.time + 120; e.contract = null;
    e.reputation = Math.max(0, e.reputation - 10); e.failed++;
    report(w, id, '납품 기한 만료 · 보증금 소멸 · 평판 −10');
  }
}

const level = (max: number, min = 0) => z.number().int().min(min).max(max);
const time = z.number().finite().min(0).max(100000);
const economySchema = z.strictObject({
  city: level(4, 1), warehouse: level(3), market: level(3), port: level(1),
  workers: z.strictObject({ mine: level(36), farm: level(36), trade: level(36), idle: level(36) }),
  tax: z.enum(['low', 'balanced', 'high']), happiness: z.number().finite().min(20).max(100), reputation: level(100),
  construction: z.strictObject({ key: z.enum(['city', 'warehouse', 'market', 'port']), remaining: time.positive() }).nullable(),
  shipment: z.strictObject({ route: z.enum(['caravan', 'overseas']), remaining: time.positive(), reward: level(1000, 1), loads: level(3, 1) }).nullable(),
  contract: z.strictObject({ key: z.enum(['provisions', 'bullion', 'harvest']), deadline: time, escrow: level(80, 20).optional(), legacy: z.boolean().optional() }).nullable(),
  exportReadyAt: time.optional(),
  availableAt: z.strictObject({ provisions: time, bullion: time, harvest: time }),
  exports: level(1000000), completed: level(1000000), failed: level(1000000), tradeGold: z.number().finite().min(0).max(1e12),
});
/** Validate persisted transactions as well as scalar bounds before resuming them. */
export function validEconomy(value: unknown, now: number): value is KingdomEconomy {
  const result = economySchema.safeParse(value);
  if (!result.success) return false;
  const e = result.data;
  if (population(e) < 12 || population(e) > populationCap(e) || (!e.market && e.workers.trade > 0)) return false;
  if (e.port && (e.city < 2 || e.market < 1)) return false;
  if (Object.values(e.availableAt).some(available => available > now + 120 + 1e-7)) return false;
  if (e.construction) {
    const { key, remaining } = e.construction;
    if (e[key] >= INFRASTRUCTURE[key].max || remaining > infrastructureCost(e, key).seconds) return false;
    if (key === 'port' && (e.city < 2 || e.market < 1)) return false;
  }
  if (e.shipment) {
    const def = ROUTES[e.shipment.route];
    if (e.market < e.shipment.loads || (def.port && !e.port) || e.shipment.remaining > def.seconds ||
      e.shipment.reward < Math.round(def.gold * .8) * e.shipment.loads || e.shipment.reward > Math.round(def.gold * 1.2) * e.shipment.loads) return false;
  }
  if (e.exportReadyAt !== undefined && e.exportReadyAt > now + 15 + 1e-7) return false;
  if (e.contract) {
    const def = CONTRACTS[e.contract.key], legacy = e.contract.legacy === true;
    if (legacy && !((e.contract.key === 'provisions' && e.contract.escrow === 35) || (e.contract.key === 'harvest' && e.contract.escrow === 80))) return false;
    if (!legacy && e.contract.escrow !== undefined && e.contract.escrow !== def.deposit) return false;
    if (e.market < (legacy ? 1 : def.market) || e.contract.deadline <= now || e.contract.deadline > now + def.seconds + 1e-7) return false;
  }
  return true;
}


/** The public city prototype stored its smaller economy on each faction in v3. */
export function migrateFactionEconomy(value: unknown, now: number): KingdomEconomy | null {
  const schema = z.object({
    city: level(3,1), market: level(3), miners: level(8), farmers: level(8),
    construction: z.object({kind:z.enum(['city','market']),remaining:time.positive().max(25)}).nullable(),
    contract:z.object({kind:z.enum(['grain','relief']),deadline:time}).nullable(),
    cooldown:z.number().finite().min(0).max(15),completed:level(10000000),failed:level(10000000),exports:level(10000000),
  }).safeParse(value);
  if(!schema.success)return null;
  const old=schema.data,capacity=4+(old.city-1)*2;
  if(old.miners+old.farmers>capacity || old.construction&&old[old.construction.kind]>=3)return null;
  if(old.contract&&(!old.market||old.contract.deadline<=now||old.contract.deadline>now+(old.contract.kind==='grain'?60:90)+.001))return null;
  const e=createEconomy();e.city=old.city;e.market=old.market;
  e.workers={mine:old.miners*3,farm:old.farmers*3,trade:0,idle:(capacity-old.miners-old.farmers)*3};
  e.completed=old.completed;e.failed=old.failed;e.exports=old.exports;e.reputation=Math.max(0,Math.min(100,50+10*(old.completed-old.failed)));
  e.exportReadyAt=now+old.cooldown;
  if(old.construction)e.construction={key:old.construction.kind,remaining:old.construction.remaining};
  if(old.contract)e.contract={key:old.contract.kind==='grain'?'provisions':'harvest',deadline:old.contract.deadline,legacy:true,escrow:old.contract.kind==='grain'?35:80};
  return validEconomy(e,now)?e:null;
}
