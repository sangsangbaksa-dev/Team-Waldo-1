// OUTLAW CITY — 도시 주행용 차량 물리·충돌·보행자 충격과 장애물을 살피는 자동 운전.
import { GRAVITY, PLAYER_ID, VEHICLES, clamp, wrapAngle, type Ped, type Vehicle } from './types';
import type { Sim } from './sim';
import { collideBox, groundHeight, rayStatic } from './world';

interface Motion { vy: number; air: boolean; reverse: number; honk: number; back: number; avoid: number }
const motions = new WeakMap<Vehicle, Motion>(), hits = new WeakMap<Ped, number>();
function motion(v: Vehicle): Motion {
  let m = motions.get(v); if (!m) { m = { vy: 0, air: false, reverse: 0, honk: 0, back: 0, avoid: v.id % 2 ? 1 : -1 }; motions.set(v, m); } return m;
}
const blend = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);
function local(v: Vehicle): void { const c = Math.cos(v.h), s = Math.sin(v.h); v.vf = v.vx * c + v.vz * s; v.vl = -v.vx * s + v.vz * c; }
function crash(sim: Sim, v: Vehicle, power: number, by: number, scale = 1): void {
  if (power <= 4) return;
  sim.damageVehicle(v, (power - 4) ** 2 * 0.65 * scale, by);
  if (v.crashT <= 0) sim.emit({ t: 'crash', id: v.id, power, x: v.x, z: v.z });
  v.crashT = Math.max(v.crashT, 0.22);
}

// 중심 격자를 틱마다 한 번 만들고 이동 시 갱신해 먼 차끼리 SAT를 하지 않습니다.
interface Grid { frame: number; cells: Map<string, Set<Vehicle>>; keys: Map<Vehicle, string> }
const grids = new WeakMap<Sim, Grid>();
function put(g: Grid, v: Vehicle): void {
  const key = `${Math.floor(v.x / 12)},${Math.floor(v.z / 12)}`, old = g.keys.get(v); if (old === key) return;
  if (old) g.cells.get(old)?.delete(v);
  let bucket = g.cells.get(key); if (!bucket) { bucket = new Set(); g.cells.set(key, bucket); } bucket.add(v); g.keys.set(v, key);
}
function gridFor(sim: Sim): Grid {
  let g = grids.get(sim);
  if (!g || g.frame !== sim.frame) { g = { frame: sim.frame, cells: new Map(), keys: new Map() }; grids.set(sim, g); for (const v of sim.vehicles) put(g, v); } return g;
}
/** 가까운 두 차의 OBB를 분리하고 질량에 따라 반대 충격량을 적용합니다. */
export function collideVehicles(sim: Sim, a: Vehicle, b: Vehicle): void {
  const da = VEHICLES[a.kind], db = VEHICLES[b.kind];
  if (a.y >= b.y + db.height || b.y >= a.y + da.height) return;
  const ac = Math.cos(a.h), as = Math.sin(a.h), bc = Math.cos(b.h), bs = Math.sin(b.h), dx = b.x - a.x, dz = b.z - a.z;
  let depth = Infinity, nx = 0, nz = 0;
  for (const [x, z] of [[ac, as], [-as, ac], [bc, bs], [-bs, bc]]) {
    const ra = Math.abs(x * ac + z * as) * da.halfL + Math.abs(-x * as + z * ac) * da.halfW;
    const rb = Math.abs(x * bc + z * bs) * db.halfL + Math.abs(-x * bs + z * bc) * db.halfW;
    const along = dx * x + dz * z, overlap = ra + rb - Math.abs(along); if (overlap <= 0) return;
    if (overlap < depth) { depth = overlap; nx = x * (along < 0 ? -1 : 1); nz = z * (along < 0 ? -1 : 1); }
  }
  const ia = 1 / da.mass, ib = 1 / db.mass, sum = ia + ib, push = (depth + 0.005) / sum;
  a.x -= nx * push * ia; a.z -= nz * push * ia; b.x += nx * push * ib; b.z += nz * push * ib;
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing > 0) {
    const j = 1.25 * closing / sum, tangent = clamp((-(a.vx - b.vx) * nz + (a.vz - b.vz) * nx) / sum, -j * 0.18, j * 0.18);
    const ix = nx * j - nz * tangent, iz = nz * j + nx * tangent;
    a.vx -= ix * ia; a.vz -= iz * ia; b.vx += ix * ib; b.vz += iz * ib;
    a.yawRate -= (ac * nz - as * nx) * j * ia * 0.08; b.yawRate += (bc * nz - bs * nx) * j * ib * 0.08;
    const ad = a.driver, bd = b.driver;
    crash(sim, a, closing, bd, a.kind === 'tank' ? 0.015 : b.kind === 'tank' ? 4 : db.mass / (da.mass + db.mass));
    crash(sim, b, closing, ad, b.kind === 'tank' ? 0.015 : a.kind === 'tank' ? 4 : da.mass / (da.mass + db.mass));
  }
  local(a); local(b);
}
function pedestrians(sim: Sim, v: Vehicle, dt: number): void {
  const d = VEHICLES[v.kind], c = Math.cos(v.h), s = Math.sin(v.h), speed = Math.hypot(v.vx, v.vz), direction = v.vf < 0 ? -1 : 1;
  for (const p of sim.peds) {
    if (!p.alive || p.vehicle || p.y + 1.7 < v.y || p.y > v.y + d.height) continue;
    const dx = p.x - v.x, dz = p.z - v.z, f = (dx * c + dz * s) * direction, l = -dx * s + dz * c;
    // 보행 물리가 먼저 밀어내므로 범퍼 바깥도 조금 검사합니다.
    if (f < -0.25 || f > d.halfL + 0.65 + speed * dt || Math.abs(l) > d.halfW + 0.5) continue;
    if (speed > 4) {
      if ((hits.get(p) ?? -Infinity) > sim.t) continue; hits.set(p, sim.t + 0.8);
      const by = v.driver; sim.damagePed(p, (speed - 2) * 6, by, 'vehicle');
      p.vx = c * direction * Math.min(22, speed * 0.8); p.vz = s * direction * Math.min(22, speed * 0.8); p.vy = Math.min(9, 2 + speed * 0.18); p.grounded = false;
      sim.emit({ t: 'scream', id: p.id });
      if (by === PLAYER_ID && (p.team === 'civ' || p.team === 'cop')) sim.addCrime(p.team === 'cop' ? 'copAssault' : 'roadkill', p.x, p.z, by, p.id, 1.5);
    } else if (speed > 0.1) { const side = Math.sign(l || 1); p.x -= s * side * speed * dt; p.z += c * side * speed * dt; }
  }
}
/** 입력으로 속도·방향을 갱신하고 지형·차·보행자 충돌을 처리합니다. */
export function stepVehicle(sim: Sim, v: Vehicle, dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt) || !v.alive) return;
  const d = VEHICLES[v.kind], m = motion(v), elapsed = Math.min(dt, 0.25), steps = Math.ceil(elapsed * 120), ds = elapsed / steps, g = gridFor(sim);
  v.crashT = Math.max(0, v.crashT - elapsed); v.hornT = Math.max(0, v.hornT - elapsed); m.honk = Math.max(0, m.honk - elapsed);
  if (v.driver && !v.wrecked && v.input.horn) { v.hornT = 0.25; if (m.honk <= 0) { sim.emit({ t: 'honk', id: v.id }); m.honk = 0.5; } }
  for (let i = 0; i < steps; i++) {
    local(v); const oldForward = v.vf, c = Math.cos(v.h), s = Math.sin(v.h), active = !!v.driver && !v.wrecked;
    const throttle = active ? clamp(v.input.throttle, 0, 1) : 0, brake = active ? clamp(v.input.brake, 0, 1) : 0;
    const hold = !active && (v.mode === 'parked' || v.wrecked), hand = active && v.input.handbrake;
    const engine = v.hp < v.maxHp * 0.3 ? 0.75 : 1, top = d.top * engine;
    if (brake > 0 && throttle === 0 && Math.abs(v.vf) < 0.3) m.reverse += ds; else if (brake === 0 || throttle > 0) m.reverse = 0;
    if (!m.air) {
      if (throttle > 0) v.vf += (v.vf < -0.2 ? d.brake : d.accel * engine * Math.max(0, 1 - (Math.max(0, v.vf) / top) ** 2.6)) * throttle * ds;
      if (brake > 0) { if (v.vf > 0) v.vf = Math.max(0, v.vf - d.brake * brake * ds); else if (m.reverse > 0.3 && !hand) v.vf = Math.max(-12, v.vf - d.accel * 0.65 * brake * ds); }
      const drag = hold ? (v.wrecked ? 12 : d.brake) : hand ? 7 : throttle || brake ? 0 : 1.2 + 0.0015 * v.vf ** 2;
      v.vf -= Math.sign(v.vf) * Math.min(Math.abs(v.vf), drag * ds);
      if (v.vf > top) v.vf = Math.max(top, v.vf - 5 * ds);
    }
    const av = Math.abs(v.vf), drifting = hand && av > 5;
    v.steer += ((active ? clamp(v.input.steer, -1, 1) : 0) - v.steer) * blend(9, ds);
    const yaw = v.steer * v.vf / (5.5 + av * av / 42) * d.turn * Math.min(1, av / 2) * (drifting ? 1.5 : 1);
    v.yawRate += ((m.air ? 0 : yaw) - v.yawRate) * blend(m.air ? 1 : drifting ? 5 : 10, ds);
    v.vx = c * v.vf - s * v.vl; v.vz = s * v.vf + c * v.vl;
    v.h = wrapAngle(v.h + v.yawRate * ds); local(v);
    if (!m.air) v.vl *= Math.exp(-d.grip * (1 - sim.rain * 0.32) * (drifting ? 0.16 : hold ? 2 : 1) * ds);
    const nc = Math.cos(v.h), ns = Math.sin(v.h); v.vx = nc * v.vf - ns * v.vl; v.vz = ns * v.vf + nc * v.vl;
    const gy0 = groundHeight(sim.map, v.x, v.z); v.x += v.vx * ds; v.z += v.vz * ds;
    for (let pass = 0; pass < 3; pass++) {
      const hit = collideBox(sim.map, v.x, v.z, v.h, d.halfL, d.halfW, v.y + 0.05, v.y + d.height); if (!hit) break;
      v.x += hit.dx; v.z += hit.dz; const vn = v.vx * hit.nx + v.vz * hit.nz;
      if (vn < 0) { const tx = v.vx - vn * hit.nx, tz = v.vz - vn * hit.nz; v.vx = tx * 0.85 - vn * hit.nx * 0.27; v.vz = tz * 0.85 - vn * hit.nz * 0.27;
        v.yawRate += clamp((nc * hit.nz - ns * hit.nx) * -vn * 0.07, -1.5, 1.5); crash(sim, v, -vn, v.driver); }
    }
    const gy = groundHeight(sim.map, v.x, v.z), rise = (gy - gy0) / ds;
    if (!m.air && av > 8 && m.vy > 2 && rise < m.vy - GRAVITY * ds - 0.15) m.air = true;
    if (!m.air && v.y > gy + 0.15) m.air = true;
    if (m.air) { m.vy -= GRAVITY * ds; v.y += m.vy * ds;
      if (v.y <= gy) { const impact = -m.vy; v.y = gy; m.air = false; m.vy = 0; if (impact > 7) crash(sim, v, impact, v.driver, 0.8); }
    } else { v.y = gy; m.vy = clamp(rise, -20, 20); }
    const slope = Math.atan2(groundHeight(sim.map, v.x + nc * d.halfL, v.z + ns * d.halfL) - groundHeight(sim.map, v.x - nc * d.halfL, v.z - ns * d.halfL), 2 * d.halfL);
    const bank = Math.atan2(groundHeight(sim.map, v.x - ns * d.halfW, v.z + nc * d.halfW) - groundHeight(sim.map, v.x + ns * d.halfW, v.z - nc * d.halfW), 2 * d.halfW);
    v.pitch += (clamp((m.air ? Math.atan2(m.vy, Math.max(av, 5)) : slope) - (v.vf - oldForward) / ds * 0.003, -0.6, 0.6) - v.pitch) * blend(6, ds);
    v.roll += (clamp(bank - v.yawRate * v.vf * 0.008, -0.25, 0.25) - v.roll) * blend(7, ds);
    v.wheel += v.vf * ds / 0.34; pedestrians(sim, v, ds); put(g, v);
    const gx = Math.floor(v.x / 12), gz = Math.floor(v.z / 12);
    for (let x = gx - 1; x <= gx + 1; x++) for (let z = gz - 1; z <= gz + 1; z++) for (const q of [...(g.cells.get(`${x},${z}`) ?? [])]) {
      // Each moving body must check its new position against both older and newer cars.
      // SAT already rejects separated bodies; removed entries in the frame grid are ignored.
      if (q === v || !q.alive || sim.vehicle(q.id) !== q) continue; collideVehicles(sim, v, q); put(g, q);
    }
    put(g, v); local(v);
  }
}
/** 목표점으로 향하는 조향·정지·회피·후진 재시도 제어. */
export function autoDrive(sim: Sim, v: Vehicle, tx: number, tz: number, targetSpeed: number, dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const m = motion(v), d = VEHICLES[v.kind], inp = v.input, c = Math.cos(v.h), s = Math.sin(v.h), speed = Math.max(0, v.vf), dist = Math.hypot(tx - v.x, tz - v.z);
  const err = wrapAngle(Math.atan2(tz - v.z, tx - v.x) - v.h), look = d.halfL + 4 + speed * 0.8 + speed * speed / (d.brake * 1.2);
  let gap = Infinity, avoid = 0;
  for (const q of sim.vehicles) {
    if (q === v || !q.alive || Math.abs(q.y - v.y) > 3) continue;
    const dx = q.x - v.x, dz = q.z - v.z, f = dx * c + dz * s, l = -dx * s + dz * c, qd = VEHICLES[q.kind];
    const extent = Math.abs(Math.cos(q.h - v.h)) * qd.halfL + Math.abs(Math.sin(q.h - v.h)) * qd.halfW;
    const width = Math.abs(Math.sin(q.h - v.h)) * qd.halfL + Math.abs(Math.cos(q.h - v.h)) * qd.halfW;
    if (f > 0 && f - extent < look && Math.abs(l) < d.halfW + width + 0.7) { gap = Math.min(gap, f - extent - d.halfL); avoid += l >= 0 ? -0.45 : 0.45; }
  }
  for (const p of sim.peds) {
    if (!p.alive || p.vehicle || Math.abs(p.y - v.y) > 2) continue;
    const dx = p.x - v.x, dz = p.z - v.z, f = dx * c + dz * s, l = -dx * s + dz * c;
    if (f > 0 && f < look && Math.abs(l) < d.halfW + 1) { gap = Math.min(gap, f - d.halfL - 0.6); avoid += l >= 0 ? -0.3 : 0.3; }
  }
  const rays: number[] = [], rayDirection = m.back > 0 ? -1 : 1;
  // 양 끝 레이를 조금 벌려 차폭을 지키면서 작은 장애물 옆의 빈 공간도 찾습니다.
  for (const side of [-1, 0, 1]) {
    const angle = v.h + side * 0.28;
    rays.push(rayStatic(sim.map, v.x - s * side * d.halfW, v.y + Math.min(0.8, d.height / 2), v.z + c * side * d.halfW, Math.cos(angle) * rayDirection, 0, Math.sin(angle) * rayDirection, look));
  }
  const wall = Math.min(...rays) - d.halfL; gap = Math.min(gap, wall);
  if (rayDirection > 0 && rays[1] < look && (rays[0] > rays[1] + 1.5 || rays[2] > rays[1] + 1.5)) {
    avoid += rays[0] === rays[2] ? m.avoid * 0.6 : rays[0] > rays[2] ? -0.6 : 0.6;
  }
  let desired = Math.min(Math.max(0, targetSpeed), d.top, Math.sqrt(2 * d.brake * 0.45 * Math.max(0, dist - 0.6)), Math.max(0, (dist - 0.5) * 1.8));
  desired *= Math.max(0.15, Math.cos(Math.min(Math.abs(err), Math.PI / 2)));
  if (gap < Infinity) desired = Math.min(desired, Math.sqrt(2 * d.brake * 0.45 * Math.max(0, gap - 2)), Math.max(0, (gap - 2) * 1.5));
  v.stuck = targetSpeed > 1 && dist > 3 && speed < 0.6 ? v.stuck + dt : Math.max(0, v.stuck - dt * 2);
  if (v.stuck > 3 && m.back <= 0) { m.back = 1.7; v.stuck = 0; m.avoid *= -1; }
  inp.handbrake = false;
  if (m.back > 0) {
    m.back -= dt;
    const rearBlocked = (rayDirection < 0 && Math.min(...rays) < d.halfL + 3) || sim.vehicles.some(q => q !== v && Math.hypot(q.x - v.x + c * 5, q.z - v.z + s * 5) < 3) || sim.peds.some(p => p.alive && !p.vehicle && Math.hypot(p.x - v.x + c * 4, p.z - v.z + s * 4) < 2);
    if (rearBlocked) { inp.throttle = v.vf < -0.1 ? 1 : 0; inp.brake = 0; inp.handbrake = true; m.back = 0; }
    else { inp.throttle = 0; inp.brake = v.vf > -4 ? 0.6 : 0; }
    inp.steer = -m.avoid * 0.8; return;
  }
  const steering = clamp(err * 2.2 - v.yawRate * 0.35 + clamp(avoid, -0.65, 0.65), -1, 1);
  inp.steer += (steering - inp.steer) * blend(6, dt);
  inp.throttle = desired > speed + 0.15 ? clamp((desired - speed) * 0.6, 0, 1) : 0;
  inp.brake = speed > desired + 0.1 ? clamp((speed - desired) * 0.7, 0, 1) : 0;
  if (desired < 0.15) { inp.throttle = 0; inp.brake = 1; inp.handbrake = true; }
  else if (v.vf < -0.1) { inp.throttle = 1; inp.brake = 0; }
}
