// OUTLAW CITY — 상점·부동산·차고·체육관·병원·보석금 같은 돈 쓰는 서비스와 수입·업적 갱신. Sim 위에서 돌아가는 순수 로직입니다.
import type { Sim } from './sim';
import { PLAYER_ID, VEHICLES, type VehicleKind } from './types';
import { ACHIEVEMENTS, CAR_SHOP, OUTFITS, OUTFIT_PRICE, PROPERTIES, PROP_CAP_MIN, propertyRate } from './life';
import { collideBox, groundHeight } from './world';

const money = (n: number): string => '$' + Math.floor(n).toLocaleString('en-US');

/** 매 틱: 부동산 수입 적립, 통계 갱신, 업적 지급 */
export function stepLife(sim: Sim, dt: number): void {
  const l = sim.life, rate = propertyRate(l, sim.perk);
  if (rate > 0) l.propBank = Math.min(rate * PROP_CAP_MIN * 60, l.propBank + rate * dt);
  const c = l.counters;
  c.maxCash = Math.max(c.maxCash ?? 0, Math.floor(sim.cash)); c.maxStars = Math.max(c.maxStars ?? 0, sim.wanted.stars); c.kills = Math.max(c.kills ?? 0, sim.kills);
  c.story = sim.mission.completed.length;
  if (sim.frame % 30 !== 0) return;
  for (const a of ACHIEVEMENTS) {
    if (l.ach.includes(a.id) || !a.test(c, l)) continue;
    l.ach.push(a.id); sim.addCash(a.reward); sim.emit({ t: 'activity', kind: 'achievement', what: 'pass', text: `업적 달성 · ${a.name} · +${money(a.reward)}` });
  }
}

// ---------- 부동산 ----------
export function buyProperty(sim: Sim, id: string): string {
  const q = PROPERTIES.find(p => p.id === id); if (!q) return '없는 매물입니다';
  if (sim.life.props.includes(id)) return '이미 소유 중입니다'; if (sim.cash < q.price) return '돈이 부족합니다';
  sim.addCash(-q.price); sim.life.props.push(id); return `${q.name} 인수 · 분당 ${money(q.income * sim.perk.biz)}`;
}
export function collectProperties(sim: Sim): string {
  const n = Math.floor(sim.life.propBank); if (n < 1) return '아직 모인 수입이 없습니다'; sim.life.propBank -= n; sim.addCash(n); return `수입 ${money(n)} 수금`;
}

// ---------- 차량 ----------
export function buyCar(sim: Sim, index: number): string {
  const poi = sim.nearPoi(sim.player.x, sim.player.z); if (!poi || poi.kind !== 'dealer') return '자동차 매장이 아닙니다';
  const o = CAR_SHOP[index]; if (!o) return '없는 차량입니다'; const price = sim.price(o.price);
  if (sim.life.cars.some(c => c.kind === o.kind)) return '이미 보유한 차종입니다'; if (sim.cash < price) return '돈이 부족합니다';
  sim.addCash(-price); sim.life.cars.push({ kind: o.kind, color: o.color }); const placed = spawnOwned(sim, sim.life.cars.length - 1, poi.x + 8, poi.z - 4); return `${VEHICLES[o.kind].name} 구입 · 내 차고에 등록${placed ? '' : ' · 주차 공간 부족, 휴대폰에서 호출하세요'}`;
}
/** 내 차를 지정한 위치(없으면 플레이어 근처 도로)에 놓습니다. */
export function spawnOwned(sim: Sim, index: number, x?: number, z?: number): boolean {
  const car = sim.life.cars[index]; if (!car) return false;
  const old = sim.vehicles.filter(v => v.tag === 'owned' && v.aux === 100 + index);
  if (old.some(v => v.driver === PLAYER_ID || v.passengers.includes(PLAYER_ID))) return false;
  // Never despawn an occupied vehicle: callers can retry when it is empty.
  if (old.some(v => !v.wrecked && (v.driver !== 0 || v.passengers.length > 0))) return false;
  const d = VEHICLES[car.kind], radius = Math.hypot(d.halfL, d.halfW), p = sim.player;
  const tx = x ?? p.x + Math.cos(p.yaw) * 14, tz = z ?? p.z + Math.sin(p.yaw) * 14;
  const candidates = sim.map.lanes.filter(l => Math.hypot(l.x - tx, l.z - tz) < 140)
    .sort((a, b) => Math.hypot(a.x - tx, a.z - tz) - Math.hypot(b.x - tx, b.z - tz));
  const lane = candidates.find(l => {
    if (Math.abs(l.x) + radius >= sim.map.half || Math.abs(l.z) + radius >= sim.map.half || groundHeight(sim.map, l.x, l.z) > .08) return false;
    if (collideBox(sim.map, l.x, l.z, l.h, d.halfL + .25, d.halfW + .25, 0, d.height)) return false;
    if (sim.vehicles.some(v => !old.includes(v) && Math.hypot(v.x - l.x, v.z - l.z) < radius + Math.hypot(VEHICLES[v.kind].halfL, VEHICLES[v.kind].halfW) + 1)) return false;
    return !sim.peds.some(q => q.alive && !q.vehicle && Math.hypot(q.x - l.x, q.z - l.z) < radius + .8);
  });
  if (!lane) return false;
  // Commit only after a clear position has been found.
  for (const v of old) sim.removeVehicle(v);
  const v = sim.spawnVehicle(car.kind, lane.x, lane.z, lane.h, { keep: true, tag: 'owned', aux: 100 + index, color: car.color, locked: false }); v.mode = 'parked'; v.input.brake = 1; return true;
}
export function callCar(sim: Sim, index: number): string {
  const car = sim.life.cars[index]; if (!car) return '차량이 없습니다'; if (sim.player.vehicle) return '차에서 내린 뒤 호출하세요';
  const fee = sim.price(150); if (sim.cash < fee) return '호출비가 부족합니다'; if (sim.wanted.stars > 0) return '수배 중에는 대리 기사가 오지 않습니다';
  if (!spawnOwned(sim, index)) return '안전한 주차 공간이 없습니다. 잠시 후 다시 호출하세요';
  sim.addCash(-fee); return `${VEHICLES[car.kind].name} 도착 · 호출비 ${money(fee)}`;
}
export const vehicleName = (k: VehicleKind): string => VEHICLES[k].name;

// ---------- 자판기·옷장 ----------
export function nearVending(sim: Sim): boolean {
  const p = sim.player; if (p.vehicle || p.hp >= p.maxHp) return false;
  for (const q of sim.map.props) if ((q.kind === 'vending' || q.kind === 'kiosk') && Math.abs(q.x - p.x) < 2.4 && Math.abs(q.z - p.z) < 2.4) return true; return false;
}
export function buySnack(sim: Sim): string {
  if (!nearVending(sim)) return '자판기가 없습니다'; const fee = sim.price(8); if (sim.cash < fee) return '돈이 부족합니다';
  sim.addCash(-fee); const p = sim.player; p.hp = Math.min(p.maxHp, p.hp + 25 * sim.perk.heal); return `음료 구입 · 체력 회복 · ${money(fee)}`;
}
export function setOutfit(sim: Sim, i: number): string {
  if (!Number.isInteger(i) || i < -1 || i >= OUTFITS.length) return '없는 복장입니다';
  const fee = sim.price(OUTFIT_PRICE); if (sim.life.outfit === i) return '이미 입고 있습니다'; if (sim.cash < fee) return '돈이 부족합니다'; sim.addCash(-fee); sim.life.outfit = i; return `새 옷 · ${money(fee)}`;
}

// ---------- 병원·보석금 ----------
export function treat(sim: Sim): string {
  const p = sim.player, poi = sim.nearPoi(p.x, p.z); if (!poi || poi.kind !== 'hospital') return '병원이 아닙니다';
  const fee = sim.price(120); if (p.hp >= p.maxHp && p.armor >= 40) return '치료할 곳이 없습니다'; if (sim.cash < fee) return '돈이 부족합니다';
  sim.addCash(-fee); p.hp = p.maxHp; p.armor = Math.max(p.armor, 40); return `치료 완료 · ${money(fee)}`;
}
export function bribe(sim: Sim): string {
  const w = sim.wanted; if (!w.stars) return '수배 중이 아닙니다'; if (w.unseenT < 4) return '경찰이 보고 있어 접근할 수 없습니다';
  const fee = sim.price(900 * w.stars); if (sim.cash < fee) return `뇌물 ${money(fee)} 필요`;
  sim.addCash(-fee); w.heat = 0; w.evadeT = 0; sim.setStars(0); return `뇌물 ${money(fee)} · 수배 해제`;
}
