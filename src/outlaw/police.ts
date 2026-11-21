// OUTLAW CITY — 범죄 신고·단계별 경찰 증원·차량 추격·수색과 공정한 체포 판정.
import type { Sim } from './sim';
import { PLAYER_ID, blankCarInput, blankPedInput, wrapAngle, type Crime, type LaneNode, type Ped, type Vehicle } from './types';
import { findPath, nearestLane } from './world';
import { autoDrive } from './vehicle';

type Role = 'patrol' | 'swat' | 'tank' | 'block';
interface Unit { role: Role; crew: number[]; repath: number; idle: number }
interface Report { crime: Crime; witnesses: number[]; left: number }
interface State { units: Map<number, Unit>; reports: Report[]; spawn: number; quiet: number; stars: number; peak: number; paths: number; contact: number; arrestCop: number; arrestVehicle: number }
export const chaseEscapeReward = (peak: number): number => Math.max(0, Math.min(5, Math.floor(peak))) * 150;
const states = new WeakMap<Sim, State>(), thresholds = [0, 1, 4, 9, 16, 26], escape = [0, 15, 20, 25, 30, 35], TAG = 'outlaw:police';
function state(sim: Sim): State {
  let s = states.get(sim); if (!s) { s = { units: new Map(), reports: [], spawn: 0, quiet: 0, stars: 0, peak: 0, paths: 1, contact: 0, arrestCop: 0, arrestVehicle: 0 }; states.set(sim, s); } return s;
}
function admit(sim: Sim, c: Crime): void {
  const w = sim.wanted; w.heat += Math.max(0, c.weight); w.lastX = c.x; w.lastZ = c.z; w.unseenT = 0; w.evadeT = 0;
  let stars = 0; for (let i = 1; i <= 5; i++) if (w.heat >= thresholds[i]) stars = i;
  if (stars > w.stars) sim.setStars(stars);
}
function crimes(sim: Sim, s: State, dt: number): void {
  for (let i = s.reports.length - 1; i >= 0; i--) {
    const r = s.reports[i]; r.left -= dt;
    if (!r.witnesses.some(id => sim.ped(id)?.alive)) s.reports.splice(i, 1);
    else if (r.left <= 0) { admit(sim, r.crime); s.reports.splice(i, 1); }
  }
  for (const c of sim.crimes.splice(0)) {
    if (c.by !== PLAYER_ID || !sim.player.alive) continue;
    if (c.kind === 'copAssault' || c.kind === 'copMurder' || c.kind === 'bank') { admit(sim, c); continue; }
    let cop = false; const witnesses: number[] = [];
    for (const p of sim.peds) {
      if (!p.alive || (p.team !== 'cop' && p.team !== 'civ')) continue;
      const v = sim.vehicle(p.vehicle), x = v?.x ?? p.x, z = v?.z ?? p.z, d = Math.hypot(x - c.x, z - c.z);
      if (c.kind === 'explosion') { if (d <= 120) { cop = true; break; } continue; }
      const radius = p.team === 'cop' ? (c.kind === 'shooting' ? 90 : 70) : (c.kind === 'shooting' ? 25 : 35);
      if (d > radius || !sim.canSee(x, z, c.x, c.z, (v?.y ?? p.y) + 1.5)) continue;
      if (p.team === 'cop') { cop = true; break; } witnesses.push(p.id);
    }
    if (cop) admit(sim, c);
    else if (witnesses.length) {
      // 같은 목격자의 연속 범죄는 신고 시각을 늦추지 않고 묶습니다.
      const pending = s.reports.find(r => r.crime.kind === c.kind && r.witnesses.length === witnesses.length && r.witnesses.every(id => witnesses.includes(id)));
      if (pending) { pending.crime.weight += c.weight; pending.crime.x = c.x; pending.crime.z = c.z; }
      else s.reports.push({ crime: { ...c }, witnesses, left: 2.5 });
    }
  }
}
function drop(sim: Sim, s: State, v: Vehicle, u: Unit): void {
  for (const id of u.crew) { const p = sim.ped(id); if (p && (!p.vehicle || p.vehicle !== sim.player.vehicle) && p.tag === TAG) sim.removePed(p); }
  if (v.driver !== PLAYER_ID && !v.keep) sim.removeVehicle(v); else { v.siren = false; v.tag = ''; }
  s.units.delete(v.id);
}
function hiddenNode(sim: Sim, front: boolean, partner?: Vehicle): LaneNode | undefined {
  const p = sim.player, car = sim.vehicle(p.vehicle), h = car?.h ?? p.yaw, lanes = sim.map.lanes;
  // 바리케이드 두 대는 같은 길의 양 차선을 막되 옆으로 빠져나갈 틈은 남깁니다.
  if (partner) {
    const n = lanes[partner.lane]; if (!n) return;
    for (const side of [-1, 1]) {
      const x = partner.x - Math.sin(n.h) * side * 6, z = partner.z + Math.cos(n.h) * side * 6, d = Math.hypot(x - p.x, z - p.z);
      if (d >= 90 && d <= 170 && !sim.canSee(p.x, p.z, x, z, p.y + 1.5)) return { ...n, x, z };
    }
    return;
  }
  let best: LaneNode | undefined, score = -Infinity;
  const start = Math.floor(sim.rng() * lanes.length);
  // 거리와 진행 방향을 먼저 걸러 스폰당 건물 레이 수를 줄입니다.
  for (let i = 0; i < lanes.length; i++) {
    const n = lanes[(start + i) % lanes.length], dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz);
    if (d < 90 || d > 170 || (front && dx * Math.cos(h) + dz * Math.sin(h) < d * 0.65)) continue;
    const value = -Math.abs(d - 125) + sim.rng() * 10;
    if (value <= score || sim.vehicles.some(v => Math.hypot(v.x - n.x, v.z - n.z) < 9)) continue;
    if (!sim.canSee(p.x, p.z, n.x, n.z, p.y + 1.5)) { best = n; score = value; }
  }
  return best;
}
function spawn(sim: Sim, s: State, role: Role, n: LaneNode): void {
  const stars = sim.wanted.stars, available = 16 - sim.peds.filter(p => p.alive && p.team === 'cop').length;
  const count = Math.min(available, role === 'swat' ? 4 : role === 'tank' || role === 'block' || stars === 0 || stars >= 4 ? 1 : 2);
  if (count < 1 || sim.vehicles.filter(v => v.tag === TAG).length >= 14) return;
  const v = sim.spawnVehicle(role === 'swat' ? 'van' : role === 'tank' ? 'tank' : 'police', n.x, n.z, n.h + (role === 'block' ? Math.PI / 2 : 0), { mode: role === 'block' ? 'parked' : 'police', siren: stars > 0, lane: n.id, tag: TAG, color: role === 'swat' ? 0x202937 : role === 'tank' ? 0x53614a : 0x18243a });
  const u: Unit = { role, crew: [], repath: 0, idle: 0 }; s.units.set(v.id, u);
  for (let i = 0; i < count; i++) {
    const p = sim.spawnPed(role === 'swat' ? 'swat' : role === 'tank' ? 'soldier' : 'cop', v.x, v.z, { tag: TAG, mode: 'idle', vehicle: v.id, seat: i });
    u.crew.push(p.id); if (!i) v.driver = p.id; else v.passengers.push(p.id);
    if (role === 'block' && !i && sim.spikes.length < 4) sim.spikes.push({ x: n.x + Math.cos(n.h) * 14, z: n.z + Math.sin(n.h) * 14, h: n.h });
    if (role === 'block') { sim.exitVehicle(p); p.x -= Math.cos(n.h) * 3; p.z -= Math.sin(n.h) * 3; p.mode = 'guard'; p.tx = p.x; p.tz = p.z; p.target = PLAYER_ID; }
  }
  if (role === 'tank' && available > count) {
    const p = sim.spawnPed('soldier', n.x - Math.sin(n.h) * 4, n.z + Math.cos(n.h) * 4, { tag: TAG, mode: 'chase', target: 0, tx: sim.wanted.lastX, tz: sim.wanted.lastZ }); u.crew.push(p.id);
  }
}
function desired(stars: number): Array<[Role, number]> {
  return stars === 0 ? [['patrol', 3]] : stars === 1 ? [['patrol', 2]] : stars === 2 ? [['patrol', 4]] : stars === 3 ? [['swat', 1], ['patrol', 5]] : stars === 4 ? [['swat', 2], ['block', 2], ['patrol', 5]] : [['tank', 2], ['swat', 3]];
}
function patrol(sim: Sim, v: Vehicle, dt: number): void {
  let n = sim.map.lanes[v.nextLane];
  if (!n || Math.hypot(n.x - v.x, n.z - v.z) < 8) {
    const current = n ?? sim.map.lanes[v.lane] ?? sim.map.lanes[nearestLane(sim.map, v.x, v.z, v.h)]; if (!current) return;
    v.lane = current.id; v.nextLane = current.next[Math.floor(sim.rng() * current.next.length)] ?? current.id; n = sim.map.lanes[v.nextLane];
  }
  if (n) autoDrive(sim, v, n.x, n.z, Math.min(13, n.limit), dt);
}
function pursue(sim: Sim, s: State, v: Vehicle, u: Unit, seen: boolean, dt: number): void {
  const w = sim.wanted, p = sim.player, pv = sim.vehicle(p.vehicle), x = seen ? pv?.x ?? p.x : w.lastX, z = seen ? pv?.z ?? p.z : w.lastZ, d = Math.hypot(v.x - x, v.z - z);
  v.siren = true;
  if (u.role === 'block') { v.input = blankCarInput(); v.input.handbrake = true; return; }
  if (!v.driver) {
    v.input = blankCarInput(); v.input.handbrake = true;
    if (seen && pv && Math.abs(pv.vf) > 5 && d > 32) for (const id of u.crew) {
      const q = sim.ped(id); if (!q?.alive || q.vehicle || Math.hypot(q.x - v.x, q.z - v.z) > 7) continue;
      if (!v.driver) sim.enterVehicle(q, v); else if (v.passengers.length < 3) { q.vehicle = v.id; q.seat = v.passengers.length + 1; v.passengers.push(q.id); }
    }
    return;
  }
  const stop = seen && d < 28 && (!pv || Math.abs(pv.vf) < 2 || (u.role === 'swat' && d < 20 && Math.abs(pv.vf) < 6));
  if (stop) {
    v.input = blankCarInput(); v.input.brake = 1; v.input.handbrake = true;
    if (Math.hypot(v.vx, v.vz) < 2) for (const id of u.crew) { const q = sim.ped(id); if (q?.alive && q.vehicle === v.id) { sim.exitVehicle(q); q.mode = 'attack'; q.target = PLAYER_ID; q.tx = x; q.tz = z; } }
    return;
  }
  if (Math.hypot(v.x - p.x, v.z - p.z) > 190) { v.input = blankCarInput(); v.input.handbrake = true; return; }
  u.repath -= dt; let tx = x, tz = z;
  if (d > 60 || !sim.canSee(v.x, v.z, x, z, v.y + 1)) {
    if (u.repath <= 0 && s.paths > 0) { s.paths--; v.lane = nearestLane(sim.map, v.x, v.z, v.h); v.path = findPath(sim.map, v.lane, x, z); u.repath = 2 + sim.rng(); }
    while (v.path.length && Math.hypot(sim.map.lanes[v.path[0]].x - v.x, sim.map.lanes[v.path[0]].z - v.z) < 9) v.path.shift();
    const node = sim.map.lanes[v.path[0]]; if (node) { tx = node.x; tz = node.z; }
  } else if (pv && seen && Math.abs(pv.vf) > 5) {
    const lead = w.stars >= 3 ? 0.65 : 0.25, side = v.id % 2 ? 1.8 : -1.8;
    tx += pv.vx * lead - Math.sin(pv.h) * side; tz += pv.vz * lead + Math.cos(pv.h) * side;
  }
  if (!seen && d < 18) { patrol(sim, v, dt); return; }
  autoDrive(sim, v, tx, tz, !seen ? 17 : Math.min(42, 22 + w.stars * 4), dt);
  // 저수배 단계는 차를 박지 않으며 고수배에서도 보행자에게는 돌진하지 않습니다.
  if (seen && pv && w.stars >= 3 && d > 7 && d < 16 && Math.abs(pv.vf) > 5 && Math.abs(wrapAngle(Math.atan2(tz - v.z, tx - v.x) - v.h)) < 0.3 && sim.canSee(v.x, v.z, tx, tz, v.y + 1)) { v.input.throttle = 0.65; v.input.brake = 0; }
}

export function stepPolice(sim: Sim, dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const s = state(sim), w = sim.wanted, p = sim.player; s.paths = 1; s.spawn -= dt;
  // 서비스가 수배를 지웠다면 이전 통화가 완료되어 다시 별이 붙지 않게 합니다.
  if (s.stars > 0 && !w.stars) { s.reports.length = 0; s.peak = 0; }
  crimes(sim, s, dt);
  if (!p.alive) { s.peak = 0; s.reports.length = 0; w.bustT = 0; s.contact = 0; for (const q of sim.peds) if (q.team === 'cop') { q.input = blankPedInput(); q.mode = 'idle'; q.target = 0; } for (const id of s.units.keys()) { const v = sim.vehicle(id); if (v && v.driver !== PLAYER_ID) { v.input = blankCarInput(); v.input.handbrake = true; } } return; }
  s.peak = sim.downKind ? 0 : Math.max(s.peak, w.stars);
  const cops = sim.peds.filter(q => q.alive && q.team === 'cop'), pv = sim.vehicle(p.vehicle), px = pv?.x ?? p.x, pz = pv?.z ?? p.z;
  let seen = false;
  for (const q of cops) { const v = sim.vehicle(q.vehicle), x = v?.x ?? q.x, z = v?.z ?? q.z; if (Math.hypot(x - px, z - pz) <= 70 && sim.canSee(x, z, px, pz, (v?.y ?? q.y) + 1.5)) { seen = true; break; } }
  if (w.stars > 0) {
    s.quiet = 0;
    if (seen) { w.unseenT = 0; w.lastX = px; w.lastZ = pz; w.evadeT = 0; w.heat = Math.max(thresholds[w.stars], w.heat - dt * 0.003); }
    else {
      const previous = w.unseenT; w.unseenT += dt; w.heat = Math.max(thresholds[w.stars], w.heat - dt * 0.03);
      if (w.unseenT > 8) {
        if (w.evadeT <= 0) { w.evadeT = escape[w.stars]; sim.say('수색 중 — 시야 밖에서 숨어 계세요', 2.5); }
        w.evadeT -= Math.min(dt, w.unseenT - Math.max(8, previous));
        if (w.evadeT <= 0) { const old = w.stars; w.heat = Math.max(0, thresholds[old] - 0.1); sim.setStars(old - 1); w.evadeT = old > 1 ? escape[old - 1] : 0; if (old === 1) { w.heat = 0; const reward = chaseEscapeReward(s.peak); s.peak = 0; if (reward) sim.addCash(reward); sim.say(`추격을 따돌렸습니다 · +$${reward}`, 3); } }
      }
    }
  } else { w.evadeT = 0; w.unseenT += dt; s.quiet += dt; w.heat = Math.max(0, w.heat - dt * 0.015); }
  if (s.stars > 0 && !w.stars) { s.quiet = 0; s.reports.length = 0; }
  // 도색·리스폰으로 별이 사라진 틱에도 기존 전투 입력을 즉시 끊습니다.
  for (const q of cops) if (!q.vehicle) {
    if (Math.hypot(q.x - px, q.z - pz) > 190) { q.input = blankPedInput(); continue; }
    if (!w.stars) { q.mode = 'idle'; q.target = 0; q.input = blankPedInput(); if (q.tag === TAG) { q.timer -= dt; if (q.timer <= 0 || Math.hypot(q.tx - q.x, q.tz - q.z) < 2) { q.timer = 5; let best = Infinity; for (const point of sim.map.walkPoints) { const d = Math.hypot(point.x - q.x, point.z - q.z); if (d > 3 && d < best) { best = d; q.tx = point.x; q.tz = point.z; } } } q.input.mz = 0.3; q.input.yaw = Math.atan2(q.tz - q.z, q.tx - q.x); } }
    else if (!seen) {
      q.mode = 'chase'; q.target = 0; q.tx = w.lastX; q.tz = w.lastZ;
      // 전투 AI의 8초 기억이 끝난 뒤에도 실제 마지막 목격 지점까지 수색을 계속합니다.
      q.input = blankPedInput(); const dx = q.tx - q.x, dz = q.tz - q.z;
      if (Math.hypot(dx, dz) > 3) {
        let h = Math.atan2(dz, dx);
        if (!sim.canSee(q.x, q.z, q.x + Math.cos(h) * 2, q.z + Math.sin(h) * 2, q.y + 0.7)) h += (q.id % 2 ? 1 : -1) * Math.PI / 2;
        q.input.yaw = h; q.input.mz = 1; q.input.sprint = true;
      }
    }
    else if (![...s.units.values()].some(u => u.role === 'block' && u.crew.includes(q.id)) || Math.hypot(q.x - px, q.z - pz) < 40) { q.mode = 'attack'; q.target = PLAYER_ID; }
  }
  for (const [id, u] of s.units) {
    const v = sim.vehicle(id); if (!v) { s.units.delete(id); continue; }
    const d = Math.hypot(v.x - px, v.z - pz); u.idle = !v.driver && u.role !== 'block' ? u.idle + dt : 0;
    if ((d > 260 || (u.idle > 18 && d > 60) || (!w.stars && s.quiet > 25 && (u.role !== 'patrol' || s.units.size > 3))) && v.driver !== PLAYER_ID) { drop(sim, s, v, u); continue; }
    if (v.wrecked || v.driver === PLAYER_ID) continue;
    if (!w.stars) {
      v.siren = false;
      if (!v.driver) for (const id of u.crew) { const q = sim.ped(id); if (q?.alive && !q.vehicle && Math.hypot(q.x - v.x, q.z - v.z) < 7) { sim.enterVehicle(q, v); break; } }
      if (v.driver) { v.mode = 'police'; patrol(sim, v, dt); }
      else if (s.quiet > 25) { v.mode = 'parked'; v.tag = ''; v.input = blankCarInput(); v.input.handbrake = true; s.units.delete(id); }
    }
    else pursue(sim, s, v, u, seen, dt);
  }
  // 상위 단계는 총원 상한을 지키며 순찰차 동승자 예산을 특공대에 양보합니다.
  if (w.stars >= 4) for (const u of s.units.values()) if (u.role === 'patrol') for (const id of u.crew.slice(1)) { const q = sim.ped(id); if (q?.vehicle && q.tag === TAG) sim.removePed(q); }
  const plan = desired(w.stars);
  if (w.stars) for (const [id, u] of s.units) {
    const count = [...s.units.values()].filter(other => other.role === u.role).length, cap = plan.find(([r]) => r === u.role)?.[1] ?? 0, v = sim.vehicle(id);
    if (v && count > cap && v.driver !== PLAYER_ID && Math.hypot(v.x - px, v.z - pz) > 70 && !sim.canSee(px, pz, v.x, v.z, p.y + 1.5)) drop(sim, s, v, u);
  }
  const live = sim.peds.filter(q => q.alive && q.team === 'cop').length;
  if (s.spawn <= 0 && live < 16 && (!w.stars || w.unseenT < 8)) {
    const role = plan.find(([r, n]) => [...s.units].filter(([id, u]) => u.role === r && !sim.vehicle(id)?.wrecked && sim.vehicle(id)?.driver !== PLAYER_ID).length < n)?.[0];
    if (role) { const partner = role === 'block' ? [...s.units].find(([, u]) => u.role === 'block')?.[0] : undefined; const node = hiddenNode(sim, role === 'block', partner === undefined ? undefined : sim.vehicle(partner)); if (node) spawn(sim, s, role, node); }
    s.spawn = w.stars ? 5 - w.stars * 0.55 + sim.rng() * 0.5 : 4;
    if (!w.stars && live < 5) { const q = sim.map.walkPoints.find(q => { const d = Math.hypot(q.x - px, q.z - pz); return d > 55 && d < 100 && !sim.peds.some(p => p.team === 'cop' && Math.hypot(p.x - q.x, p.z - q.z) < 20); }); if (q) sim.spawnPed('cop', q.x, q.z, { tag: TAG }); }
  }
  for (const q of cops) if (q.tag === TAG && !q.vehicle && (Math.hypot(q.x - px, q.z - pz) > 260 || (!w.stars && s.quiet > 25 && Math.hypot(q.x - px, q.z - pz) > 100))) sim.removePed(q);
  // 스파이크 스트립: 시야 밖 오래된 것은 걷어가고, 고속으로 밟은 차는 타이어가 터져 감속·휘청입니다.
  sim.spikes = sim.spikes.filter(k => w.stars > 0 ? Math.hypot(k.x - px, k.z - pz) < 260 : s.quiet < 12 && Math.hypot(k.x - px, k.z - pz) < 260);
  if (pv && pv.driver === PLAYER_ID) {
    if (!pv.flat) for (const k of sim.spikes) if (Math.hypot(k.x - pv.x, k.z - pv.z) < 4.2 && Math.abs(pv.vf) > 4) { pv.flat = true; sim.say('타이어 펑크! 스파이크 스트립', 3); sim.emit({ t: 'crash', id: pv.id, power: 0.5, x: pv.x, z: pv.z }); break; }
    if (pv.flat) { const f = Math.exp(-dt * 0.55); pv.vx *= f; pv.vz *= f; pv.vf *= f; pv.yawRate += Math.sin(sim.t * 17) * dt * 0.9; }
  }
  w.cops = sim.peds.filter(q => q.alive && q.team === 'cop').length;
  // 같은 경찰과의 연속 접촉만 인정하고 벽·층 차이·공격 입력은 즉시 해제합니다.
  let nearest: Ped | undefined, close = 0;
  if (w.stars && !p.input.fire && p.punchT <= 0 && (!pv || Math.abs(pv.vf) < 2)) for (const q of cops) {
    if (!sim.ped(q.id) || q.vehicle || Math.abs(q.y - p.y) > 2 || !sim.canSee(q.x, q.z, px, pz, q.y + 1)) continue;
    const d = Math.hypot(q.x - px, q.z - pz); if (d < 4) close++; if (d < 2.2 && (!nearest || q.id === s.arrestCop)) nearest = q;
  }
  const valid = pv ? close >= 2 : !!nearest;
  if (s.arrestVehicle !== p.vehicle) { s.contact = 0; s.arrestVehicle = p.vehicle; }
  if (valid) { if (!pv && s.arrestCop !== nearest!.id) s.contact = 0; s.arrestCop = nearest?.id ?? 0; s.contact += dt; } else { s.contact = 0; s.arrestCop = 0; }
  w.bustT = Math.min(1, s.contact / (pv ? 3 : 2.2));
  if (w.bustT >= 1) { p.alive = false; p.input = blankPedInput(); sim.downKind = 'busted'; sim.deadT = 0; sim.emit({ t: 'busted' }); s.reports.length = 0; }
  s.stars = w.stars;
}
