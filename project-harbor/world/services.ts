import { DISTRICTS, type District } from './domain';
import { MAX_HEALTH, WEAPONS, type Vitals } from './street';

export type ServiceKind = 'clinic' | 'garage' | 'supply';
export interface ServiceSite { id: string; district: District; kind: ServiceKind; x: number; z: number }
export const SERVICE_INFO = {
  clinic: { label: '의료소', color: 0x79e3a1, symbol: '+', price: 35 },
  garage: { label: '정비소', color: 0x65b6ed, symbol: 'P', price: 55 },
  supply: { label: '탄약 상점', color: 0xe6bb70, symbol: 'A', price: 45 },
} as const;
const KINDS: readonly ServiceKind[] = ['clinic', 'garage', 'supply'];
export const SITES: readonly ServiceSite[] = DISTRICTS.flatMap(d => KINDS.map((kind, i) => ({
  id: d.id + ':' + kind, district: d.id, kind, x: d.x + 68, z: d.z - 162 + i * 256,
})));
export const DISCOVERY_REWARD = 60;
export function nearestService(x: number, z: number, range = 12): ServiceSite | null {
  let nearest: ServiceSite | null = null;
  let distance = range;
  for (const site of SITES) {
    const gap = Math.hypot(site.x - x, site.z - z);
    if (gap <= distance) { nearest = site; distance = gap; }
  }
  return nearest;
}
export interface ServiceVehicle { health: number; maxHealth: number; speed: number }
export function visitService(visited: Set<string>, site: ServiceSite, vitals: Vitals): boolean {
  if (visited.has(site.id)) return false;
  visited.add(site.id); vitals.money += DISCOVERY_REWARD; return true;
}
export function buyService(site: ServiceSite, v: Vitals, car: ServiceVehicle | null): { ok: boolean; message: string } {
  const fail = (message: string) => ({ ok: false, message });
  const info = SERVICE_INFO[site.kind];
  if (v.wanted > 0) return fail('수배 중에는 서비스를 이용할 수 없습니다.');
  switch (site.kind) {
    case 'clinic':
      if (car) return fail('차에서 내려 의료소를 이용하세요.');
      if (v.health >= MAX_HEALTH) return fail('이미 건강합니다.');
      break;
    case 'garage':
      if (!car) return fail('차량에 탑승한 상태로 방문하세요.');
      if (Math.abs(car.speed) > 0.8) return fail('차량을 완전히 정차하세요.');
      if (car.health >= car.maxHealth) return fail('수리가 필요하지 않습니다.');
      break;
    case 'supply':
      if (car) return fail('차에서 내려 상점을 이용하세요.');
      if (!v.weapon) return fail('먼저 무기를 장비하세요.');
      if (v.reserve >= WEAPONS[v.weapon].reserve * 3) return fail('탄약 보관 한도에 도달했습니다.');
      break;
  }
  if (v.money < info.price) return fail('현금이 부족합니다. 필요: $' + info.price);
  v.money -= info.price;
  if (site.kind === 'clinic') v.health = MAX_HEALTH;
  else if (site.kind === 'garage' && car) car.health = car.maxHealth;
  else if (site.kind === 'supply' && v.weapon) {
    const reserve = WEAPONS[v.weapon].reserve;
    v.reserve = Math.min(reserve * 3, v.reserve + reserve);
  }
  return { ok: true, message: info.label + ' 이용 완료 · -$' + info.price };
}
