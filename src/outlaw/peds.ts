// OUTLAW CITY — 시민 배회·공포 반응과 플레이어 주변 인구 스트리밍.
import type { Sim } from './sim';
import type { CityMap, Ped } from './types';
import { surfaceAt, moveCircle, districtAt } from './world';

const RADIUS = 190, CELL = 25;
type Point = { x: number; z: number };
type Memory = { x: number; z: number; stuck: number; speed: number; scream: number; last: number; mode: string };
type State = { map: CityMap; points: Map<number, Point[]>; memories: WeakMap<Ped, Memory>; eventIndex: number; events: Sim['events']; tick: number; stream: number; count: number; target: number };
const states = new WeakMap<Sim, State>();
// Compact numeric cell coordinates: avoid allocating strings during every
// civilian waypoint query in crowded districts.
const key = (x: number, z: number): number => (x + 2048) * 4096 + z + 2048;
const civil = (p: Ped): boolean => p.id !== 1 && (p.kind === 'civ' || p.team === 'civ');
function stateFor(sim: Sim): State {
  let s = states.get(sim); if (s && s.map === sim.map) return s;
  const points = new Map<number, Point[]>();
  for (const p of sim.map.walkPoints) { const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)), a = points.get(k); if (a) a.push(p); else points.set(k, [p]); }
  s = { map: sim.map, points, memories: new WeakMap(), eventIndex: 0, events: sim.events, tick: 0, stream: 0, count: 0, target: 25 }; states.set(sim, s); return s;
}
function choosePoint(sim: Sim, s: State, p: Ped): boolean {
  const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL), fx = Math.cos(p.yaw), fz = Math.sin(p.yaw); let best: Point | undefined, score = -Infinity;
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const q of s.points.get(key(x, z)) ?? []) {
    const dx = q.x - p.x, dz = q.z - p.z, d2 = dx * dx + dz * dz; if (d2 < 64 || d2 > 625) continue;
    const d = Math.sqrt(d2), v = (dx * fx + dz * fz) / d + sim.rng() * 1.2;
    if (v <= score) continue;
    // 경로 중간의 도로와 정적 장애물을 미리 거릅니다.
    let clear = true; for (let n = 1; n <= 3; n++) { const f = n / 4, x1 = p.x + dx * f, z1 = p.z + dz * f; if (surfaceAt(sim.map, x1, z1) === 'road' || moveCircle(sim.map, x1, z1, 0.45, p.y, p.y + 1.8).hit) { clear = false; break; } }
    if (clear) { score = v; best = q; }
  }
  if (!best) return false; p.tx = best.x; p.tz = best.z; return true;
}
function fright(sim: Sim, p: Ped, m: Memory, x: number, z: number, radius: number): void {
  const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz); if (d > radius || p.mode === 'flee') return;
  const visible = d < 12 || sim.canSee(p.x, p.z, x, z, p.y + 1.5), r = sim.rng();
  if (d > radius * 0.65 && visible && r < 0.18) { p.mode = 'idle'; p.timer = 2 + sim.rng() * 3; p.input.yaw = Math.atan2(-dz, -dx); }
  else if (d < 14 && r < 0.22) { p.mode = 'cower'; p.timer = 3 + sim.rng() * 3; p.input.yaw = Math.atan2(-dz, -dx); }
  else { const a = Math.atan2(dz || 0.01, dx || 0.01) + (sim.rng() - 0.5) * 0.8; p.mode = 'flee'; p.timer = 6 + sim.rng() * 6; p.tx = p.x + Math.cos(a) * 35; p.tz = p.z + Math.sin(a) * 35; if (sim.t - m.scream >= 2 && sim.rng() < 0.3) { sim.emit({ t: 'scream', id: p.id }); m.scream = sim.t; } }
}
export function stepPeds(sim: Sim, dt: number): void {
  const s = stateFor(sim), player = sim.player; s.tick++; s.stream -= dt;
  const events = sim.events; if (s.events !== events || events.length < s.eventIndex) { s.events = events; s.eventIndex = 0; }
  const end = events.length, threats: Array<{ x: number; z: number; r: number }> = [];
  for (let i = s.eventIndex; i < end; i++) { const e = events[i]; if (e.t === 'shot' && e.weapon !== 'fist') threats.push({ x: e.ox, z: e.oz, r: 60 }); else if (e.t === 'explosion') threats.push({ x: e.x, z: e.z, r: 90 }); else if (e.t === 'crash' && e.power >= 8) threats.push({ x: e.x, z: e.z, r: 35 }); else if (e.t === 'death') { const p = sim.ped(e.id); if (p) threats.push({ x: p.x, z: p.z, r: 35 }); } }
  s.eventIndex = end;
  if (s.stream <= 0) {
    s.stream = 0.25;
    // Parks deliberately have no buildings: nearest-building classification
    // mislabeled them and spawned the much larger residential crowds.
    const district = districtAt(sim.map, player.x, player.z);
    s.target = district === 'downtown' || district === 'commercial' ? 62 : district === 'industrial' ? 22 : district === 'park' ? 20 : 38;
    s.count = 0; let removed = 0;
    for (let i = sim.peds.length - 1; i >= 0; i--) { const p = sim.peds[i]; if (!civil(p) || !p.alive) continue; const dx = p.x - player.x, dz = p.z - player.z; if (!p.vehicle && !p.keep && dx * dx + dz * dz > (RADIUS * 1.15) ** 2 && removed < 2) { sim.removePed(p); removed++; } else s.count++; }
    while (s.count > s.target && removed < 2) { let candidate: Ped | undefined, distance = 35 ** 2; for (const p of sim.peds) { if (!civil(p) || !p.alive || p.vehicle || p.keep) continue; const dx = p.x - player.x, dz = p.z - player.z, d = dx * dx + dz * dz; if (d > distance) { candidate = p; distance = d; } } if (!candidate) break; sim.removePed(candidate); s.count--; removed++; }
    const pts = sim.map.walkPoints, facingX = Math.cos(player.yaw), facingZ = Math.sin(player.yaw); let spawned = 0;
    while (s.count < Math.min(66, s.target) && spawned < 2 && pts.length) {
      let best: Point | undefined, bestScore = -Infinity;
      for (let i = 0; i < 40; i++) { const q = pts[Math.floor(sim.rng() * pts.length)], dx = q.x - player.x, dz = q.z - player.z, d2 = dx * dx + dz * dz; if (d2 < 35 ** 2 || d2 > RADIUS ** 2) continue; const d = Math.sqrt(d2), score = d / RADIUS - (dx * facingX + dz * facingZ) / d + sim.rng() * 0.5; if (score > bestScore) { best = q; bestScore = score; } }
      if (!best) break; sim.spawnPed('civ', best.x, best.z, { variant: Math.floor(sim.rng() * 9) }); s.count++; spawned++;
    }
  }
  for (const p of sim.peds) {
    if (!civil(p) || !p.alive || p.vehicle || p.mode === 'scripted') continue;
    let m = s.memories.get(p); if (!m) { m = { x: p.x, z: p.z, stuck: 0, speed: sim.rng() < 0.15 ? 0.8 : 0.4 + sim.rng() * 0.15, scream: -Infinity, last: sim.t, mode: '' }; s.memories.set(p, m); }
    for (const t of threats) fright(sim, p, m, t.x, t.z, t.r);
    const dx = p.x - player.x, dz = p.z - player.z, far = dx * dx + dz * dz > 8100;
    if (far && (s.tick + p.id) % 6 !== 0 && !threats.length) continue;
    const elapsed = Math.max(dt, sim.t - m.last); m.last = sim.t; p.timer -= elapsed;
    if (player.aiming && sim.curGun(player)?.id !== 'fist' && sim.curGun(player) && dx * dx + dz * dz < 625 && dx * Math.cos(player.yaw) + dz * Math.sin(player.yaw) > 0 && sim.rng() < elapsed * 0.7) fright(sim, p, m, player.x, player.z, 25);
    for (const v of sim.vehicles) { const vx = v.vx, vz = v.vz, speed = Math.hypot(vx, vz), x = p.x - v.x, z = p.z - v.z, d2 = x * x + z * z; if (!v.alive || speed <= 6 || d2 > 400 || x * vx + z * vz <= 0) continue; const side = x * -vz + z * vx >= 0 ? 1 : -1; p.mode = 'flee'; p.timer = Math.max(p.timer, 2); p.tx = p.x - vz / speed * side * 20; p.tz = p.z + vx / speed * side * 20; break; }
    if ((p.mode === 'flee' || p.mode === 'cower' || p.mode === 'idle') && p.timer <= 0) { p.mode = 'wander'; p.tx = p.x; p.tz = p.z; }
    if (p.mode === 'flee' && m.mode !== 'flee' && Math.hypot(p.tx - p.x, p.tz - p.z) < 2) { const a = Math.atan2(p.z - player.z, p.x - player.x); p.tx = p.x + Math.cos(a) * 30; p.tz = p.z + Math.sin(a) * 30; }
    const input = p.input; input.mx = 0; input.mz = 0; input.sprint = false; input.crouch = p.mode === 'cower';
    if (p.mode === 'wander' || p.mode === 'flee') {
      const moved = Math.hypot(p.x - m.x, p.z - m.z); m.stuck = moved < elapsed * 0.25 ? m.stuck + elapsed : 0; m.x = p.x; m.z = p.z;
      if (p.mode === 'wander' && (Math.hypot(p.tx - p.x, p.tz - p.z) < 2 || m.stuck > 1.5)) { m.stuck = 0; if (sim.rng() < 0.1) { p.mode = 'idle'; p.timer = 2 + sim.rng() * 6; } else if (!choosePoint(sim, s, p)) { p.mode = 'idle'; p.timer = 1 + sim.rng() * 2; } }
      if (p.mode === 'flee' && m.stuck > 1.5) { m.stuck = 0; choosePoint(sim, s, p); }
      if (p.mode === 'wander' || p.mode === 'flee') { let a = Math.atan2(p.tz - p.z, p.tx - p.x); if (p.mode === 'wander') { const nx = p.x + Math.cos(a) * 1.2, nz = p.z + Math.sin(a) * 1.2; if (surfaceAt(sim.map, nx, nz) === 'road' || moveCircle(sim.map, nx, nz, 0.45, p.y, p.y + 1.8).hit) { if (!choosePoint(sim, s, p)) { p.mode = 'idle'; p.timer = 1; } else a = Math.atan2(p.tz - p.z, p.tx - p.x); } }
        if (p.mode !== 'idle') { input.yaw = a; input.mz = p.mode === 'flee' ? 1 : m.speed; input.sprint = p.mode === 'flee';
          if (p.mode === 'wander' && (s.tick + p.id) % 6 === 0) for (const q of sim.peds) { if (q === p || !q.alive || q.vehicle) continue; const x = q.x - p.x, z = q.z - p.z, d = x * x + z * z; if (d > 0.001 && d < 2.25) { const side = -Math.sin(a) * x + Math.cos(a) * z; input.mx = side >= 0 ? -0.25 : 0.25; break; } }
        }
      }
    }
    m.mode = p.mode;
  }
}
