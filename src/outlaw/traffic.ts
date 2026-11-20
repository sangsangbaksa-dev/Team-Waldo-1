// OUTLAW CITY — 지구별 차량 스트리밍과 차선·신호·혼잡·패닉 운전.
import { CIVILIAN_CARS, PLAYER_ID, VEHICLES, WEAPONS, wrapAngle, type District, type LaneNode, type Vehicle, type VehicleKind } from './types';
import { STREAM_RADIUS, type Sim } from './sim';
import { isOpen, nearestLane, signal } from './world';
import { autoDrive } from './vehicle';

interface State { events: number; eventList: Sim['events']; cars: WeakMap<Vehicle, CarState> }
interface CarState { panic: number; blocked: number; idle: number; lastCrash: boolean; update: number }
const states = new WeakMap<Sim, State>();
function state(sim: Sim): State { let s = states.get(sim); if (!s) { s = { events: 0, eventList: sim.events, cars: new WeakMap() }; states.set(sim, s); } return s; }
function carState(s: State, v: Vehicle): CarState { let c = s.cars.get(v); if (!c) { c = { panic: 0, blocked: 0, idle: 0, lastCrash: false, update: 0 }; s.cars.set(v, c); } return c; }
function district(sim: Sim, x: number, z: number): District {
  for (const p of sim.map.parks) if (Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) return 'park';
  const ix = Math.max(0, Math.min(11, Math.floor((x + sim.map.half) / sim.map.pitch))), iz = Math.max(0, Math.min(11, Math.floor((z + sim.map.half) / sim.map.pitch)));
  return ix < 3 && iz < 3 ? 'industrial' : ix >= 4 && ix <= 6 && iz >= 4 && iz <= 6 ? 'downtown' : ix >= 3 && ix <= 7 && iz >= 3 && iz <= 7 ? 'commercial' : 'residential';
}
function chooseCar(sim: Sim, d: District): VehicleKind {
  const extra: VehicleKind[] = d === 'industrial' ? ['truck', 'truck', 'van', 'van', 'van'] : d === 'downtown' || d === 'commercial' ? ['taxi', 'taxi', 'sedan', 'sedan'] : ['hatch', 'suv', 'sedan'];
  const pool = [...CIVILIAN_CARS.filter(k => k !== 'sports'), ...extra, 'sports' as VehicleKind]; return pool[Math.floor(sim.rng() * pool.length)];
}
function next(sim: Sim, node: LaneNode): number {
  if (!node.next.length) return -1;
  if (node.next.length === 1) return node.next[0];
  const options = node.next.map(id => { let n = sim.map.lanes[id]; for (let i = 0; i < 3 && n.next.length === 1 && Math.abs(wrapAngle(n.h - node.h)) < 0.2; i++) n = sim.map.lanes[n.next[0]]; return { id, turn: wrapAngle(n.h - node.h) }; });
  const r = sim.rng(), desired = r < 0.6 ? 0 : r < 0.8 ? 1 : -1;
  const matches = options.filter(o => desired === 0 ? Math.abs(o.turn) < 0.3 : desired * o.turn > 0.3);
  return (matches.length ? matches : options)[Math.floor(sim.rng() * (matches.length || options.length))].id;
}
function fillPath(sim: Sim, v: Vehicle): void {
  if (!sim.map.lanes[v.lane]) v.lane = nearestLane(sim.map, v.x, v.z, v.h);
  if (v.lane < 0) return;
  while (v.path.length < 4) { const n = sim.map.lanes[v.path.length ? v.path[v.path.length - 1] : v.lane]; if (!n) break; const id = next(sim, n); if (id < 0) break; v.path.push(id); }
  v.nextLane = v.path[0] ?? -1;
}
function spawn(sim: Sim, parked: boolean): boolean {
  const lanes = sim.map.lanes, p = sim.player;
  for (let attempt = 0; attempt < 45; attempt++) {
    const n = lanes[Math.floor(sim.rng() * lanes.length)]; if (!n || n.light >= 0 || !n.next.length) continue;
    const b = lanes[n.next[0]], length = Math.hypot(b.x - n.x, b.z - n.z); if (length < 25 || Math.abs(wrapAngle(b.h - n.h)) > 0.2) continue;
    const f = 0.15 + sim.rng() * 0.7, h = n.h, side = parked ? sim.map.roadW / 2 - 1.15 - 3.5 : 0;
    const x = n.x + (b.x - n.x) * f - Math.sin(h) * side, z = n.z + (b.z - n.z) * f + Math.cos(h) * side;
    const dx = x - p.x, dz = z - p.z, distance = Math.hypot(dx, dz); if (distance < 70 || distance > STREAM_RADIUS) continue;
    if (attempt < 30 && dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw) > 0 && sim.canSee(p.x, p.z, x, z)) continue;
    const kind = chooseCar(sim, district(sim, x, z)), def = VEHICLES[kind];
    if (!isOpen(sim.map, x, z, def.halfL + 0.3) || sim.vehicles.some(v => Math.hypot(v.x - x, v.z - z) < (parked && v.mode === 'parked' ? 7.5 : 16))) continue;
    const v = sim.spawnVehicle(kind, x, z, h, { mode: parked ? 'parked' : 'traffic', lane: n.id, nextLane: b.id, path: [b.id], locked: parked && sim.rng() < 0.1 });
    if (!parked) { const ped = sim.spawnPed('civ', x, z, { vehicle: v.id, seat: 0 }); v.driver = ped.id; fillPath(sim, v); }
    return true;
  }
  return false;
}
export function stepTraffic(sim: Sim, dt: number): void {
  if (!Number.isFinite(dt) || !(dt > 0)) return;
  const s = state(sim), p = sim.player, events = sim.events;
  if (events !== s.eventList || events.length < s.events) { s.events = 0; s.eventList = events; }
  const recent = events.slice(s.events); s.events = events.length;
  const grid = new Map<string, Vehicle[]>(), key = (x: number, z: number): string => `${Math.floor(x / 24)},${Math.floor(z / 24)}`;
  for (const v of sim.vehicles) { const k = key(v.x, v.z), bucket = grid.get(k); if (bucket) bucket.push(v); else grid.set(k, [v]); }
  const removeFromGrid = (v: Vehicle): void => { const k = key(v.x, v.z), bucket = grid.get(k); if (bucket) { const i = bucket.indexOf(v); if (i >= 0) bucket.splice(i, 1); if (!bucket.length) grid.delete(k); } sim.removeVehicle(v); };
  let moving = 0, parked = 0, removed = 0;
  for (const v of sim.vehicles.slice()) {
    if (v.keep || v.driver === PLAYER_ID || p.vehicle === v.id || v.mode === 'police' || v.mode === 'scripted' || v.mode === 'none') continue;
    const dist = Math.hypot(v.x - p.x, v.z - p.z);
    if (removed < 2 && dist > STREAM_RADIUS * (v.stolen && !v.driver ? 2 : 1.2)) { removeFromGrid(v); removed++; continue; }
    if (v.mode === 'parked') { if (!v.stolen) parked++; continue; }
    if (v.mode !== 'traffic' && v.mode !== 'flee') continue;
    moving++;
    const driver = sim.ped(v.driver);
    if (!driver || !driver.alive || driver.vehicle !== v.id || v.wrecked) { v.mode = 'none'; v.input.throttle = 0; v.input.brake = 1; v.input.handbrake = true; continue; }
    const c = carState(s, v); let danger = v.crashT > 0 && !c.lastCrash; c.lastCrash = v.crashT > 0;
    for (const e of recent) {
      if (e.t === 'crash' && e.id === v.id) danger = true;
      else if (e.t === 'shot' && e.weapon !== 'fist' && (e.ox - v.x) ** 2 + (e.oz - v.z) ** 2 < Math.min(80, WEAPONS[e.weapon].noise) ** 2) danger = true;
      else if (e.t === 'explosion' && (e.x - v.x) ** 2 + (e.z - v.z) ** 2 < (e.r + 65) ** 2) danger = true;
    }
    if (danger) { c.panic = 5 + sim.rng() * 4; v.mode = 'flee'; driver.mode = 'flee'; driver.fear = 1; }
    if (v.mode === 'flee') { c.panic -= dt; if (c.panic <= 0) { v.mode = 'traffic'; driver.mode = 'wander'; driver.fear = 0; } }
    c.update += dt; if (dist > 120 && c.update < 0.1) continue; const elapsed = c.update; c.update = 0;
    fillPath(sim, v); if (!v.path.length) continue;
    let target = sim.map.lanes[v.path[0]];
    for (let i = 0; i < 4 && target; i++) {
      const dx = target.x - v.x, dz = target.z - v.z, along = dx * Math.cos(target.h) + dz * Math.sin(target.h);
      if (Math.hypot(dx, dz) > 3.5 && !(along < 0 && Math.hypot(dx, dz) < 10)) break;
      if (target.light >= 0 && v.mode !== 'flee' && signal(sim.t, target.light) !== 'green') break;
      v.lane = v.path.shift()!; fillPath(sim, v); target = sim.map.lanes[v.path[0]];
    }
    if (!target) continue;
    let speed = Math.min(target.limit, VEHICLES[v.kind].top), tx = target.x, tz = target.z, stop = false;
    const nextNode = sim.map.lanes[v.path[1]], turn = nextNode ? Math.abs(wrapAngle(nextNode.h - target.h)) : 0;
    if (turn > 0.15) speed = Math.min(speed, Math.max(5, 10 - turn * 3));
    if (target.light >= 0 && v.mode !== 'flee') {
      const light = signal(sim.t, target.light), distance = Math.hypot(target.x - v.x, target.z - v.z), braking = Math.max(0, v.vf) ** 2 / (2 * VEHICLES[v.kind].brake * 0.55) + VEHICLES[v.kind].halfL + 2;
      let occupied = false; const cx = target.x + Math.cos(target.h) * 10, cz = target.z + Math.sin(target.h) * 10;
      // Reuse the same broad-phase grid instead of scanning every vehicle at each signal.
      for (let x = Math.floor((cx - 8) / 24); x <= Math.floor((cx + 8) / 24) && !occupied; x++) {
        for (let z = Math.floor((cz - 8) / 24); z <= Math.floor((cz + 8) / 24) && !occupied; z++) {
          for (const q of grid.get(`${x},${z}`) ?? []) if (q !== v && q.alive && Math.abs(q.x - cx) < 8 && Math.abs(q.z - cz) < 8) { occupied = true; break; }
        }
      }
      stop = light === 'red' || light === 'yellow' && distance > braking || light === 'green' && occupied;
      if (stop) speed = Math.min(speed, Math.max(0, (distance - VEHICLES[v.kind].halfL - 2) * 1.3));
    }
    const cos = Math.cos(v.h), sin = Math.sin(v.h), gx = Math.floor(v.x / 24), gz = Math.floor(v.z / 24); let gap = Infinity;
    for (let x = gx - 1; x <= gx + 1; x++) for (let z = gz - 1; z <= gz + 1; z++) for (const q of grid.get(`${x},${z}`) ?? []) {
      if (q === v || !q.alive) continue; const dx = q.x - v.x, dz = q.z - v.z, f = dx * cos + dz * sin, lateral = Math.abs(-dx * sin + dz * cos);
      if (f > 0 && lateral < 2.5 && Math.cos(q.h - v.h) > 0.7) gap = Math.min(gap, f - VEHICLES[v.kind].halfL - VEHICLES[q.kind].halfL);
    }
    if (v.mode === 'flee') speed = Math.min(VEHICLES[v.kind].top, Math.max(speed, target.limit * 1.35));
    // Panic increases desired speed, but must not override collision avoidance.
    speed = Math.min(speed, Math.max(0, (gap - 4) * 0.9));
    if (nextNode && target.light < 0 && Math.hypot(tx - v.x, tz - v.z) < 8 && turn < 0.3) { tx = nextNode.x; tz = nextNode.z; }
    autoDrive(sim, v, tx, tz, speed, elapsed);
    const waiting = stop || gap < 8; c.blocked = waiting && Math.abs(v.vf) < 1 ? c.blocked + elapsed : Math.max(0, c.blocked - elapsed * 2); v.input.horn = c.blocked > 3 && !stop && Math.floor(c.blocked * 2) % 4 === 0;
    c.idle = !waiting && speed > 2 && Math.abs(v.vf) < 0.7 ? c.idle + elapsed : Math.max(0, c.idle - elapsed);
    if (c.idle > 8 && c.idle - elapsed <= 8) { v.lane = nearestLane(sim.map, v.x, v.z, v.h); v.path = []; }
    if (c.idle > 20 && removed < 2 && !v.stolen) { removeFromGrid(v); removed++; moving--; }
  }
  const d = district(sim, p.x, p.z), goal = d === 'downtown' || d === 'commercial' ? 30 : d === 'residential' ? 18 : 10;
  if (moving < Math.min(36, goal)) spawn(sim, false);
  if (parked < 28) spawn(sim, true);
}
