import type { War } from './war';
export type Development = 'city' | 'market';
export const CONTRACTS = {
  grain: { label: '도시 식량 납품', food: 120, gold: 210, deposit: 35, duration: 60 },
  relief: { label: '구호 물자 수출', food: 260, gold: 480, deposit: 80, duration: 90 },
} as const;
export type ContractKind = keyof typeof CONTRACTS;
export interface Economy {
  city: number; market: number; miners: number; farmers: number;
  construction: { kind: Development; remaining: number } | null;
  contract: { kind: ContractKind; deadline: number } | null;
  cooldown: number; completed: number; failed: number; exports: number;
}
export const createEconomy = (): Economy => ({ city: 1, market: 0, miners: 2, farmers: 2,
  construction: null, contract: null, cooldown: 0, completed: 0, failed: 0, exports: 0 });
export const workerCapacity = (e: Economy) => 4 + (e.city - 1) * 2;
export const developmentCost = (e: Economy, kind: Development) => ({gold: kind === 'city' ? e.city * 100 : (e.market + 1) * 80, food: kind === 'city' ? e.city * 65 : (e.market + 1) * 40});
export function develop(w: War, id: number, kind: Development): boolean {
  if (kind !== 'city' && kind !== 'market') return false;
  const f = w.factions[id], e = f?.economy;
  if (!f?.alive || w.over || !e || e.construction || e[kind] >= 3) return false;
  const c = developmentCost(e, kind);
  if (f.gold < c.gold || f.food < c.food) return false;
  f.gold -= c.gold; f.food -= c.food;
  e.construction = {kind, remaining: kind === 'city' ? 25 : 20}; return true;
}
export function assignWorker(w: War, id: number, job: 'miners' | 'farmers', delta: number): boolean {
  if ((job !== 'miners' && job !== 'farmers') || (delta !== 1 && delta !== -1)) return false;
  const f = w.factions[id], e = f?.economy;
  if (!f?.alive || w.over || !e || e[job] + delta < 0 || (delta > 0 && e.miners + e.farmers >= workerCapacity(e))) return false;
  e[job] += delta; return true;
}
/** Workers complement the legacy buildings; each facility level supports two workers. */
export function economicIncome(w: War, id: number): {gold: number; food: number} {
  const f = w.factions[id], e = f.economy;
  if (!e) return {gold: 0, food: 0};
  return {gold: (Math.min(e.miners, f.mine * 2) - 2) * .45 + (e.city - 1) * .6,
    food: (Math.min(e.farmers, f.farm * 2) - 2) * .5};
}
export function exportFood(w: War, id: number): boolean {
  const f = w.factions[id], e = f?.economy;
  if (!f?.alive || w.over || !e || !e.market || e.cooldown > 0 || f.food < 60) return false;
  f.food -= 60; const gold = 60 + e.market * 15; f.gold += gold;
  w.stats[id].goldEarned += gold; e.exports++; e.cooldown = 15; return true;
}
export function acceptContract(w: War, id: number, kind: ContractKind): boolean {
  if (!Object.hasOwn(CONTRACTS, kind)) return false;
  const f = w.factions[id], e = f?.economy, c = CONTRACTS[kind];
  if (!f?.alive || w.over || !e || !e.market || e.contract || f.gold < c.deposit) return false;
  f.gold -= c.deposit; e.contract = {kind, deadline: w.time + c.duration}; return true;
}
export function deliverContract(w: War, id: number): boolean {
  const f = w.factions[id], e = f?.economy, active = e?.contract;
  if (!f?.alive || w.over || !e || !active || w.time >= active.deadline) return false;
  const c = CONTRACTS[active.kind];
  if (f.food < c.food) return false;
  f.food -= c.food; f.gold += c.gold + c.deposit;
  w.stats[id].goldEarned += c.gold; e.contract = null; e.completed++; return true;
}
export function stepEconomy(w: War, id: number, dt: number): void {
  const e = w.factions[id].economy;
  if (!e) return;
  e.cooldown = Math.max(0, e.cooldown - dt);
  if (e.construction) {
    e.construction.remaining -= dt;
    if (e.construction.remaining <= 0) { e[e.construction.kind]++; e.construction = null; }
  }
  if (e.contract && w.time >= e.contract.deadline) { e.contract = null; e.failed++; }
}
export function validEconomy(value: unknown, time: number): value is Economy {
  if (!value || typeof value !== 'object') return false;
  const e = value as Economy;
  const int = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  return int(e.city, 1, 3) && int(e.market, 0, 3) && int(e.miners, 0, 8) && int(e.farmers, 0, 8) &&
    e.miners + e.farmers <= workerCapacity(e) && Number.isFinite(e.cooldown) && e.cooldown >= 0 && e.cooldown <= 15 &&
    [e.completed, e.failed, e.exports].every(n => int(n, 0, 1e7)) &&
    (e.construction === null || (!!e.construction && ['city', 'market'].includes(e.construction.kind) &&
      e[e.construction.kind] < 3 && Number.isFinite(e.construction.remaining) && e.construction.remaining > 0 && e.construction.remaining <= 25)) &&
    (e.contract === null || (!!e.contract && Object.hasOwn(CONTRACTS, e.contract.kind) && e.market > 0 &&
      Number.isFinite(e.contract.deadline) && e.contract.deadline > time && e.contract.deadline <= time + CONTRACTS[e.contract.kind].duration + .001));
}
