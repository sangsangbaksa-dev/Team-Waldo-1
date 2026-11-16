// OUTLAW CITY — 적대 보병의 경계·추적·사격과 엄폐 전술.
import { blankPedInput, clamp, wrapAngle, WEAPONS, type Ped, type WeaponId } from './types';
import { rayStatic } from './world';
import type { Sim } from './sim';

interface Brain {
  mode: Ped['mode']; anchorX: number; anchorZ: number; guarded: boolean; seen: boolean; lastSeen: number; target: number;
  scan: number; react: number; errT: number; err: number; pitchErr: number; burst: number; pause: number;
  shotWait: number; strafe: number; strafeT: number; patrolX: number; patrolZ: number; patrolT: number; morale: boolean;
  coverX: number; coverZ: number; coverT: number; coverDir: number; detour: number; detourT: number;
}
const brains = new WeakMap<Ped, Brain>();
const ranges: Record<WeaponId, [number, number]> = { fist: [0, 1.5], shotgun: [6, 12], pistol: [12, 25], smg: [12, 25], rifle: [25, 50], sniper: [60, 90], rocket: [30, 65] };
const turn: Record<Ped['kind'], number> = { player: 4, civ: 4, cop: 4, swat: 6, soldier: 7, gang: 4.5, boss: 6 };
const accuracy: Record<Ped['kind'], number> = { player: 1, civ: 1, cop: 0.85, swat: 0.6, soldier: 0.5, gang: 1, boss: 0.65 };
function brain(p: Ped, sim: Sim): Brain {
  let b = brains.get(p); if (b) return b;
  b = { mode: p.mode, anchorX: p.tx, anchorZ: p.tz, guarded: p.mode === 'guard', seen: false, lastSeen: sim.t, target: 0,
    scan: sim.rng() * 0.2, react: 0, errT: 0, err: 0, pitchErr: 0, burst: 0, pause: 0,
    shotWait: 0, strafe: sim.rng() < 0.5 ? -1 : 1, strafeT: 0, patrolX: p.x, patrolZ: p.z, patrolT: 0, morale: false,
    coverX: p.x, coverZ: p.z, coverT: 0, coverDir: p.id % 8, detour: 1, detourT: 0 };
  brains.set(p, b); return b;
}
function position(sim: Sim, q: Ped): { x: number; y: number; z: number; vx: number; vz: number } {
  const v = q.vehicle ? sim.vehicle(q.vehicle) : undefined;
  return v ? { x: v.x, y: v.y + 0.8, z: v.z, vx: v.vx, vz: v.vz } : { x: q.x, y: q.y + (q.crouch ? 0.9 : 1.2), z: q.z, vx: q.vx, vz: q.vz };
}
function valid(sim: Sim, p: Ped, q: Ped | undefined): q is Ped { return !!q && q !== p && q.alive && q.team !== 'civ' && sim.hostile(p.team, q.team); }
function move(p: Ped, x: number, z: number, speed: number): void {
  const d = Math.hypot(x, z); if (d < 0.001) return;
  const c = Math.cos(p.input.yaw), s = Math.sin(p.input.yaw); p.input.mz = (x * c + z * s) / d * speed; p.input.mx = (-x * s + z * c) / d * speed;
}
export function stepCombat(sim: Sim, dt: number): void {
  for (const p of sim.peds) {
    if (!p.alive || p.vehicle || p.id === sim.player.id || Math.hypot(p.x - sim.player.x, p.z - sim.player.z) > 190) continue;
    const existing = brains.get(p); if (p.mode !== 'attack' && p.mode !== 'chase' && p.mode !== 'guard' && p.mode !== 'follow' && !(p.mode === 'flee' && p.team === 'gang' && existing)) continue;
    const b = brain(p, sim), input = p.input = blankPedInput(); input.yaw = p.yaw; input.pitch = p.pitch;
    if (p.mode === 'guard' && b.mode !== 'guard') { b.anchorX = p.tx; b.anchorZ = p.tz; b.guarded = true; }
    if (p.mode !== b.mode && p.mode !== 'chase') { b.seen = false; b.target = 0; }
    b.mode = p.mode; b.scan -= dt; b.react -= dt; b.shotWait -= dt; b.errT -= dt; b.strafeT -= dt; b.patrolT -= dt; b.coverT -= dt; b.detourT -= dt;
    if (p.hp >= p.maxHp * 0.25) b.morale = false;
    else if (!b.morale && p.team === 'gang' && p.kind !== 'boss' && p.mode !== 'flee') { b.morale = true; if (sim.rng() < 0.3) { p.mode = 'flee'; b.mode = 'flee'; p.timer = 6 + sim.rng() * 4; } }
    if (p.mode === 'flee') {
      p.timer -= dt; const threat = sim.ped(p.target) ?? sim.ped(p.lastHitBy); const a = threat ? position(sim, threat) : { x: p.x + Math.cos(p.hurtYaw), z: p.z + Math.sin(p.hurtYaw) };
      const dx = p.x - a.x, dz = p.z - a.z; input.yaw = Math.atan2(dz, dx); input.sprint = true; move(p, dx, dz, 1);
      if (p.timer <= 0) { p.mode = b.guarded ? 'guard' : 'idle'; if (b.guarded) { p.tx = b.anchorX; p.tz = b.anchorZ; } } continue;
    }
    if (p.mode === 'follow') {
      const q = sim.ped(p.target); if (q?.alive) { const a = position(sim, q), dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz); input.yaw = Math.atan2(dz, dx); if (d > 8) { move(p, dx, dz, 1); input.sprint = d > 18; } else if (d < 5) move(p, -dx, -dz, 0.5); } continue;
    }
    let q = sim.ped(p.target); if (!valid(sim, p, q)) q = undefined;
    if (p.mode === 'guard' && p.hurt > 0) { const attacker = sim.ped(p.lastHitBy); if (valid(sim, p, attacker)) { q = attacker; p.target = attacker.id; p.mode = 'attack'; } }
    let rays = 0;
    if (b.scan <= 0) {
      b.scan = 0.16 + sim.rng() * 0.1;
      if (!q) { let best = p.mode === 'guard' ? 45 : 100; for (const candidate of sim.peds) { if (!valid(sim, p, candidate)) continue; const a = position(sim, candidate), d = Math.hypot(a.x - p.x, a.z - p.z); if (d < best) { best = d; q = candidate; } } }
      if (q) {
        const a = position(sim, q), d = Math.hypot(a.x - p.x, a.z - p.z), radius = p.mode === 'guard' ? 45 : 120;
        const visible = d <= radius && sim.canSee(p.x, p.z, a.x, a.z, p.y + 1.5); rays++;
        if (visible) {
          if (!b.seen || b.target !== q.id) { b.react = 0.4 + sim.rng() * 0.5; b.burst = 0; b.pause = 0; }
          b.seen = true; b.target = q.id; b.lastSeen = sim.t; p.target = q.id; p.tx = a.x; p.tz = a.z;
          if (p.mode === 'guard') for (const ally of sim.peds) if (ally !== p && ally.alive && ally.team === p.team && ally.mode === 'guard' && Math.hypot(ally.x - p.x, ally.z - p.z) < 30) { brain(ally, sim); ally.target = q.id; ally.mode = 'attack'; }
          p.mode = 'attack';
        } else { if (b.seen) b.lastSeen = sim.t; b.seen = false; if (p.mode === 'attack') p.mode = 'chase'; }
      } else if (p.mode === 'attack') { b.seen = false; p.mode = 'chase'; b.lastSeen = sim.t; }
    }
    if (p.mode === 'guard') {
      if (b.patrolT <= 0) { const a = sim.rng() * Math.PI * 2, r = Math.sqrt(sim.rng()) * (p.aux > 0 ? p.aux : 12) * 0.75; b.patrolX = b.anchorX + Math.cos(a) * r; b.patrolZ = b.anchorZ + Math.sin(a) * r; b.patrolT = 3 + sim.rng() * 4; }
      const dx = b.patrolX - p.x, dz = b.patrolZ - p.z; if (Math.hypot(dx, dz) > 1) { input.yaw = Math.atan2(dz, dx); move(p, dx, dz, 0.3); } continue;
    }
    if (p.mode === 'chase') {
      if (sim.t - b.lastSeen >= 8) { p.target = 0; p.mode = b.guarded ? 'guard' : 'idle'; if (b.guarded) { p.tx = b.anchorX; p.tz = b.anchorZ; } continue; }
      const dx = p.tx - p.x, dz = p.tz - p.z; if (Math.hypot(dx, dz) > 1.5) { input.yaw = Math.atan2(dz, dx); input.sprint = true; move(p, dx, dz, 1); }
    } else if (p.mode === 'attack' && q && b.seen) {
      let slot = p.cur, gun = p.guns[slot]; if (!gun || (gun.id !== 'fist' && gun.mag <= 0 && gun.reserve <= 0) || gun.id === 'fist') { const next = p.guns.findIndex((g, i) => i > 0 && !!g && (g.mag > 0 || g.reserve > 0)); slot = next >= 0 ? next : 0; gun = p.guns[slot]; if (slot !== p.cur && gun) input.slot = slot; }
      const id = gun?.id ?? 'fist', def = WEAPONS[id], a = position(sim, q), dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz), lead = Math.min(0.25, d / 300);
      if (b.errT <= 0) { const e = accuracy[p.kind] * (0.006 + d * 0.0007 + Math.hypot(a.vx, a.vz) * 0.0015); b.err = (sim.rng() * 2 - 1) * e; b.pitchErr = (sim.rng() * 2 - 1) * e * 0.4; b.errT = 0.3 + sim.rng() * 0.4; }
      const targetYaw = Math.atan2(dz + a.vz * lead, dx + a.vx * lead) + b.err, delta = wrapAngle(targetYaw - p.yaw);
      input.yaw = p.yaw + clamp(delta, -turn[p.kind] * dt, turn[p.kind] * dt); input.pitch = clamp(Math.atan2(a.y - (sim.eyeY(p) - 0.1), Math.max(0.1, d)) + b.pitchErr, -1.2, 1.2); input.aim = true;
      if (b.strafeT <= 0) { b.strafe = sim.rng() < 0.5 ? -1 : 1; b.strafeT = 1 + sim.rng() * 2; }
      const [near, far] = ranges[id], forward = d > far ? 1 : d < near ? -0.8 : 0, side = def.melee ? 0 : b.strafe * (p.kind === 'gang' || p.kind === 'cop' ? 0.3 : 0.5);
      if (d > 0.01) move(p, dx / d * forward - dz / d * side, dz / d * forward + dx / d * side, Math.min(1, Math.hypot(forward, side)));
      input.sprint = d > far + 15; if (input.sprint) input.aim = false;
      if (gun && !def.melee && gun.mag <= 0 && gun.reserve > 0) input.reload = true;
      if (def.auto) { if (b.pause > 0) b.pause -= dt; else { if (b.burst <= 0) b.burst = 0.4 + sim.rng() * 0.8; b.burst -= dt; if (b.burst <= 0) b.pause = 0.3 + sim.rng() * 0.7; } }
      input.fire = b.react <= 0 && !input.sprint && Math.abs(delta) < 0.14 && d <= def.range * 0.9 && (!def.melee || d <= def.range) && (!def.auto || b.pause <= 0) && (def.auto || (!p.fireHeld && b.shotWait <= 0));
      if (input.fire && !def.auto) b.shotWait = def.melee ? 0.5 : Math.max(def.cd, 1.4 + sim.rng() * 0.8);
      if (p.hurt > 0 && b.coverT <= 0 && rays < 2) {
        const h = (b.coverDir++ % 8) * Math.PI / 4, cx = p.x + Math.cos(h) * 4, cz = p.z + Math.sin(h) * 4, vx = a.x - cx, vz = a.z - cz, len = Math.hypot(vx, vz);
        if (len > 1 && rayStatic(sim.map, cx, p.y + 1.2, cz, vx / len, 0, vz / len, len) < len - 0.5) { b.coverX = cx; b.coverZ = cz; b.coverT = 1.5; } rays++;
      }
      if (b.coverT > 0 && Math.hypot(b.coverX - p.x, b.coverZ - p.z) > 0.8) move(p, b.coverX - p.x, b.coverZ - p.z, 1);
    }
    if (Math.hypot(input.mx, input.mz) > 0.2 && rays < 2 && (sim.frame + p.id) % 8 === 0) {
      const c = Math.cos(input.yaw), s = Math.sin(input.yaw), wx = c * input.mz - s * input.mx, wz = s * input.mz + c * input.mx, len = Math.hypot(wx, wz);
      if (rayStatic(sim.map, p.x, p.y + 0.7, p.z, wx / len, 0, wz / len, 2) < 1.8) { b.detour = b.detourT > 0 ? b.detour : (sim.rng() < 0.5 ? -1 : 1); b.detourT = 1; }
    }
    if (b.detourT > 0 && Math.hypot(input.mx, input.mz) > 0.2) { const mx = input.mx, mz = input.mz; input.mx = mz * b.detour; input.mz = -mx * b.detour; }
  }
}


