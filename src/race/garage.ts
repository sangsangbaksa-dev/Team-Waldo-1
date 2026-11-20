// SPEED RUSH — 차고: 코인은 외형 도장에만 사용합니다.
import { SKINS, skinById } from './config';

export interface Garage { coins: number; /** 산 스킨 id(기본 stock 은 항상 보유) */ skins: string[] }

export const emptyGarage = (): Garage => ({ coins: 0, skins: [] });
export const ownsSkin = (g: Garage, id: string): boolean => id === 'stock' || g.skins.includes(id);
/** 스킨을 사고 새 차고를 돌려줍니다. 이미 있거나 코인이 모자라면 null. */
export function buySkin(g: Garage, id: string): Garage | null {
  const k = skinById(id);
  if (k.id !== id || ownsSkin(g, id) || g.coins < k.cost) return null;
  return { ...g, coins: g.coins - k.cost, skins: [...g.skins, id] };
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
  g.coins = typeof r.coins === 'number' && Number.isFinite(r.coins) ? Math.min(1e9, Math.max(0, Math.floor(r.coins))) : 0;
  if (Array.isArray(r.skins)) g.skins = SKINS.filter(k => k.id !== 'stock' && (r.skins as unknown[]).includes(k.id)).map(k => k.id);
  return g;
}

export const GARAGE_KEY = 'waldo.race.garage.v1';
export function readGarage(): Garage {
  try { return sanitizeGarage(JSON.parse(localStorage.getItem(GARAGE_KEY) ?? 'null')); } catch { return emptyGarage(); }
}
export function writeGarage(g: Garage): void {
  try { localStorage.setItem(GARAGE_KEY, JSON.stringify(g)); } catch { /* 저장 불가 환경 */ }
}
