// OUTLAW CITY — 정비소 튜닝. 내 차고의 차량에 엔진·타이어·차체 단계를 올립니다. 화면과 무관한 순수 로직입니다.
import type { Sim } from './sim';
import { VEHICLES, type Vehicle, type VehicleDef } from './types';
import { CAR_SHOP } from './life';

export interface Tune { eng: number; tire: number; arm: number }
export type TunePart = keyof Tune;
export const TUNE_MAX = 3;
export const TUNE_PARTS: Array<{ id: TunePart; name: string; desc: string; base: number }> = [
  { id: 'eng', name: '엔진 튜닝', desc: '단계마다 최고 속도 +5% · 가속 +9%', base: 2400 },
  { id: 'tire', name: '레이싱 타이어', desc: '단계마다 접지력 +7% · 2단계부터 스파이크 스트립에 터지지 않음', base: 1800 },
  { id: 'arm', name: '강화 차체', desc: '단계마다 내구도 +22%', base: 2800 },
];
export const blankTune = (): Tune => ({ eng: 0, tire: 0, arm: 0 });

/** 튜닝 단계를 반영한 차량 제원. 같은 단계 조합은 객체를 재사용합니다. */
const cache = new Map<string, VehicleDef>();
export function tunedDef(v: Vehicle): VehicleDef {
  const base = VEHICLES[v.kind], t = v.tune; if (!t || (!t.eng && !t.tire)) return base;
  const key = `${v.kind}:${t.eng}:${t.tire}`; let d = cache.get(key);
  if (!d) { d = { ...base, top: base.top * (1 + 0.05 * t.eng), accel: base.accel * (1 + 0.09 * t.eng), grip: base.grip * (1 + 0.07 * t.tire) }; cache.set(key, d); }
  return d;
}
/** 차체 단계가 반영된 최대 내구도 */
export const maxHpFor = (kind: Vehicle['kind'], tune?: Tune): number => Math.round(VEHICLES[kind].hp * (1 + 0.22 * (tune?.arm ?? 0)));

/** 한 부품의 다음 단계 가격(차가 비쌀수록 부품값도 오릅니다) */
export function partPrice(sim: Sim, kind: Vehicle['kind'], part: TunePart, level: number): number {
  const base = TUNE_PARTS.find(p => p.id === part)!.base, carPrice = CAR_SHOP.find(c => c.kind === kind)?.price ?? 8000;
  return sim.price(Math.round(base * (level + 1) * Math.min(2.6, Math.max(0.55, carPrice / 18000)) / 50) * 50);
}
export const tuneOf = (sim: Sim, index: number): Tune => sim.life.cars[index]?.tune ?? blankTune();
export const tuneComplete = (t: Tune): boolean => t.eng >= TUNE_MAX && t.tire >= TUNE_MAX && t.arm >= TUNE_MAX;

/** 길 위에 나와 있는 내 차에 튜닝을 반영합니다(내구도는 비율을 지킵니다). */
export function applyTune(v: Vehicle, tune: Tune | undefined): void {
  const old = v.maxHp || 1; v.tune = tune ? { ...tune } : undefined; const max = maxHpFor(v.kind, tune);
  v.maxHp = max; v.hp = Math.min(max, Math.max(1, v.hp * (max / old)));
}

export function buyPart(sim: Sim, index: number, part: TunePart): string {
  const poi = sim.nearPoi(sim.player.x, sim.player.z); if (!poi || (poi.kind !== 'chopshop' && poi.kind !== 'garage')) return '정비소에서만 튜닝할 수 있습니다';
  const car = sim.life.cars[index]; if (!car) return '차량이 없습니다'; const t = car.tune ?? blankTune(), lv = t[part];
  if (lv >= TUNE_MAX) return '이미 최대 단계입니다'; const price = partPrice(sim, car.kind, part, lv); if (sim.cash < price) return '돈이 부족합니다';
  sim.addCash(-price); car.tune = { ...t, [part]: lv + 1 }; sim.count('tuned');
  for (const v of sim.vehicles) if (v.tag === 'owned' && v.aux === 100 + index) { applyTune(v, car.tune); if (part === 'tire') v.flat = false; }
  const name = TUNE_PARTS.find(p => p.id === part)!.name; return `${name} ${lv + 1}단계 · $${price.toLocaleString('en-US')}`;
}
