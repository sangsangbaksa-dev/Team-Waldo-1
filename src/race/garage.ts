// SPEED RUSH — 차고: 레이스 보상 코인으로 차량 능력치를 올립니다. 화면·저장과 무관한 순수 로직입니다.
import { UPGRADE_COST, UPGRADE_MAX, clampInt as int, tierCost } from '../shared/upgrades';
import { CARS, STAT_KEYS, type StatPoints } from './config';

export { UPGRADE_COST, UPGRADE_MAX };
export type Upgrades = StatPoints;
export interface Garage { coins: number; cars: Record<string, Upgrades> }

export const zeroUpgrades = (): Upgrades => ({ accel: 0, top: 0, handling: 0, drift: 0, nitro: 0 });
export const emptyGarage = (): Garage => ({ coins: 0, cars: {} });
export const upgradesOf = (g: Garage, carId: string): Upgrades => ({ ...zeroUpgrades(), ...g.cars[carId] });
export const totalLevels = (u: Upgrades): number => STAT_KEYS.reduce((n, k) => n + u[k], 0);

export function nextCost(g: Garage, carId: string, stat: keyof StatPoints): number | null {
  return tierCost(upgradesOf(g, carId)[stat]);
}
/** 업그레이드를 사고 새 차고를 돌려줍니다. 코인이 모자라거나 최대 단계면 null. */
export function buyUpgrade(g: Garage, carId: string, stat: keyof StatPoints): Garage | null {
  const cost = nextCost(g, carId, stat);
  if (cost === null || g.coins < cost || !CARS.some(c => c.id === carId)) return null;
  const u = upgradesOf(g, carId); u[stat] += 1;
  return { coins: g.coins - cost, cars: { ...g.cars, [carId]: u } };
}

const PLACE_COINS = [220, 130, 80, 40];
/** 결승 보상: 순위 · 난이도(1~5) · 랩 수에 비례하고 최고 기록을 깨면 보너스가 붙습니다. */
export function rewardFor(place: number, level: number, laps: number, newBest: boolean): number {
  const base = PLACE_COINS[Math.max(0, Math.min(3, place - 1))] ?? 40;
  return Math.round((base * (1 + 0.2 * (level - 1)) * (0.6 + 0.2 * laps) + (newBest ? 60 : 0)) / 5) * 5;
}

/** 저장된 값이 깨져 있어도 항상 쓸 수 있는 차고로 되돌립니다. */
export function sanitizeGarage(raw: unknown): Garage {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>, g = emptyGarage();
  g.coins = int(r.coins, 1e9);
  if (typeof r.cars === 'object' && r.cars !== null) for (const c of CARS) {
    const src = (r.cars as Record<string, unknown>)[c.id];
    if (typeof src === 'object' && src !== null) { const u = zeroUpgrades(); for (const k of STAT_KEYS) u[k] = int((src as Record<string, unknown>)[k], UPGRADE_MAX); g.cars[c.id] = u; }
  }
  return g;
}

export const GARAGE_KEY = 'waldo.race.garage.v1';
export function readGarage(): Garage {
  try { return sanitizeGarage(JSON.parse(localStorage.getItem(GARAGE_KEY) ?? 'null')); } catch { return emptyGarage(); }
}
export function writeGarage(g: Garage): void {
  try { localStorage.setItem(GARAGE_KEY, JSON.stringify(g)); } catch { /* 저장 불가 환경 */ }
}
