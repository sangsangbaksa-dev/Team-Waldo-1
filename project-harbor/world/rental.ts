import { DISTRICTS, type District } from './domain';
import type { Point } from './exploration';
export type CivilVehicle = 'sedan' | 'sport' | 'truck' | 'bike' | 'jeep';
export interface RentalSite extends Point { district: District; type: CivilVehicle; name: string; price: number }
const options: Record<District, { type: CivilVehicle; name: string; price: number }> = {
  forest: { type: 'jeep', name: '오프로드 지프', price: 90 },
  city: { type: 'sedan', name: '세단', price: 45 },
  rich: { type: 'sport', name: '스포츠카', price: 140 },
  desert: { type: 'bike', name: '오토바이', price: 60 },
  slum: { type: 'truck', name: '트럭', price: 70 },
  base: { type: 'jeep', name: '오프로드 지프', price: 90 },
};
const fleet: Record<District, readonly CivilVehicle[]> = {
  forest: ['sedan', 'jeep', 'truck'],
  city: ['sedan', 'sport', 'bike', 'truck', 'sedan'],
  rich: ['sport', 'sedan', 'sport', 'bike'],
  desert: ['jeep', 'truck', 'bike', 'sedan'],
  slum: ['truck', 'bike', 'sedan', 'sedan'],
  base: ['jeep', 'truck', 'sedan'],
};
export const RENTALS: readonly RentalSite[] = DISTRICTS.map(d => ({
  district: d.id, x: d.x - 192, z: d.z + 180, ...options[d.id],
}));
export function civilType(district: District, index: number): CivilVehicle {
  const types = fleet[district];
  return types[((Math.floor(index) % types.length) + types.length) % types.length]!;
}
export function nearbyRental(at: Point, radius = 13): RentalSite | null {
  return RENTALS.find(site => Math.hypot(site.x - at.x, site.z - at.z) <= radius) ?? null;
}
export function rentalEligibility(site: RentalSite, money: number, wanted: number, driving: boolean, busy: boolean): string | null {
  if (wanted > 0) return '수배 중에는 차량을 대여할 수 없습니다.';
  if (driving || busy) return '차량에서 내린 후 대여하세요.';
  if (money < site.price) return '현금이 부족합니다. 필요: $' + site.price;
  return null;
}
