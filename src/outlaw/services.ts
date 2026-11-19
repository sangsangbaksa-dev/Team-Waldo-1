// OUTLAW CITY — 상점·부동산·차고·체육관·병원·보석금 같은 돈 쓰는 서비스와 수입·업적 갱신. Sim 위에서 돌아가는 순수 로직입니다.
import type { Sim } from './sim';
import { PLAYER_ID, VEHICLES, type VehicleKind } from './types';
import { ACHIEVEMENTS, CAR_SHOP, OUTFIT_PRICE, PROPERTIES, PROP_CAP_MIN, SKILLS, SKILL_MAX, propertyRate, skillCost, type SkillId } from './life';
import { nearestLane } from './world';
import { maxHpFor } from './tuning';

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
  sim.addCash(-price); sim.life.cars.push({ kind: o.kind, color: o.color }); spawnOwned(sim, sim.life.cars.length - 1, poi.x + 8, poi.z - 4); return `${VEHICLES[o.kind].name} 구입 · 내 차고에 등록`;
}
/** 내 차를 지정한 위치(없으면 플레이어 근처 도로)에 놓습니다. */
export function spawnOwned(sim: Sim, index: number, x?: number, z?: number): boolean {
  const car = sim.life.cars[index]; if (!car) return false;
  for (const v of sim.vehicles) if (v.tag === 'owned' && v.aux === 100 + index) { if (v.wrecked || !v.alive) sim.removeVehicle(v); else { if (v.driver === PLAYER_ID) return true; sim.removeVehicle(v); } }
  let px = x ?? sim.player.x, pz = z ?? sim.player.z, h = sim.player.yaw;
  if (x === undefined) {
    const id = nearestLane(sim.map, sim.player.x + Math.cos(sim.player.yaw) * 14, sim.player.z + Math.sin(sim.player.yaw) * 14), lane = sim.map.lanes[id];
    if (lane) { px = lane.x; pz = lane.z; h = lane.h; }
  }
  const v = sim.spawnVehicle(car.kind, px, pz, h, { keep: true, tag: 'owned', aux: 100 + index, color: car.color, locked: false }); v.mode = 'parked'; v.input.brake = 1;
  if (car.tune) { v.hp = v.maxHp = maxHpFor(car.kind, car.tune); v.tune = { ...car.tune }; }
  return true;
}
export function callCar(sim: Sim, index: number): string {
  const car = sim.life.cars[index]; if (!car) return '차량이 없습니다'; if (sim.player.vehicle) return '차에서 내린 뒤 호출하세요';
  const fee = sim.price(150); if (sim.cash < fee) return '호출비가 부족합니다'; if (sim.wanted.stars > 0) return '수배 중에는 대리 기사가 오지 않습니다';
  sim.addCash(-fee); spawnOwned(sim, index); return `${VEHICLES[car.kind].name} 도착 · 호출비 ${money(fee)}`;
}
export const vehicleName = (k: VehicleKind): string => VEHICLES[k].name;

// ---------- 체육관 ----------
export function train(sim: Sim, id: SkillId): string {
  const poi = sim.nearPoi(sim.player.x, sim.player.z); if (!poi || poi.kind !== 'gym') return '체육관이 아닙니다';
  const sk = SKILLS.find(s => s.id === id); if (!sk) return '없는 훈련입니다'; const lv = sim.life.skills[id];
  if (lv >= SKILL_MAX) return '이미 최대 단계입니다'; const price = sim.price(skillCost(lv)); if (sim.cash < price) return '돈이 부족합니다';
  sim.addCash(-price); sim.life.skills[id] = lv + 1; sim.refreshPerks(); const p = sim.player; p.maxHp = sim.perk.hp; p.hp = Math.min(p.maxHp, p.hp + 8); sim.clock = (sim.clock + 1.5) % 24;
  return `${sk.name} ${lv + 1}단계`;
}

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
