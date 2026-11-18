// ZERO ZONE — 봇 AI. 난이도(config.BOTS)에 따라 반응 속도·조준 오차·회전 속도·시야·자기장 대응이 달라집니다.
// 봇은 사람과 같은 입력(Input)만 만들어 내고, 체력이나 탄을 속이지 않습니다.
// 수송기에서는 내릴 곳을 골라 뛰어내리고, 낙하산으로 그쪽을 향해 내려갑니다. 위층 전리품은 계단으로 오릅니다.
import { PLAYER, WEAPONS, type BotTuning } from './config';
import { groundAt, lineClear, type Building } from './world';
import { findPath, navFor, walkable } from './nav';
import { eyeOf, type Match, type Player, type ZoneState } from './sim';

export interface BotBrain {
  t: BotTuning; think: number; target: number; seen: number; react: number; lastX: number; lastZ: number; lastY: number;
  goalX: number; goalZ: number; goalT: number; lootId: number; lootT: number; lootScan: number; skip: Set<number>;
  offX: number; offZ: number; stuck: number; detourT: number; detourDir: number; probeT: number; probeX: number; probeZ: number; hop: boolean;
  strafe: number; strafeT: number; errYaw: number; errPitch: number; errT: number; burstT: number; pauseT: number; head: boolean; low: boolean;
  investX: number; investZ: number; investT: number;
  path: number[] | null; pathIdx: number; pathGx: number; pathGz: number; planT: number;
  dropX: number; dropZ: number; dropS: number;
}
export function newBrain(rng: () => number, t: BotTuning): BotBrain {
  const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.6;
  return {
    t, think: rng() * 0.2, target: -1, seen: 99, react: 0, lastX: 0, lastZ: 0, lastY: 0, goalX: 0, goalZ: 0, goalT: 0, lootId: -1, lootT: 0, lootScan: rng() * 0.6, skip: new Set(), offX: Math.cos(a) * r, offZ: Math.sin(a) * r,
    stuck: 0, detourT: 0, detourDir: 1, probeT: 0, probeX: 0, probeZ: 0, hop: false, strafe: 1, strafeT: 0, errYaw: 0, errPitch: 0, errT: 0, burstT: 0, pauseT: 0, head: false, low: false, investX: 0, investZ: 0, investT: 0,
    path: null, pathIdx: 0, pathGx: 0, pathGz: 0, planT: 0, dropX: NaN, dropZ: NaN, dropS: 0,
  };
}

const angDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const gauss = (rng: () => number): number => (rng() + rng() + rng() - 1.5) / 0.75;
/** 무기별로 싸우기 좋은 거리 */
const IDEAL: Record<string, number> = { shotgun: 8, smg: 16, pistol: 18, rifle: 34, sniper: 75 };

function wantLoot(p: Player, kind: string, weapon: string | null): number {
  if (kind === 'medkit') return p.hp < 85 ? 3 + (100 - p.hp) / 20 : 0;
  if (kind === 'armor') return p.armor < 50 ? 2.6 : 0;
  if (kind === 'helmet') return p.helmet ? 0 : 2.4;
  if (kind === 'ammo') return p.guns.some(g => g && g.reserve < WEAPONS[g.id].mag * 2) ? 2 : 0;
  if (kind === 'weapon' && weapon) {
    const rank = WEAPONS[weapon as keyof typeof WEAPONS].rank;
    if (p.guns.some(g => g?.id === weapon)) return 0;
    if (p.guns.includes(null)) return 2.5 + rank / 4;
    const worst = Math.min(...p.guns.map(g => (g ? WEAPONS[g.id].rank : 0)));
    return rank - worst >= 1 ? 1.8 + (rank - worst) / 2 : 0;
  }
  return 0;
}

/** 수송기 안: 내릴 곳을 고르고 그 지점에 가장 가까워질 때 뛰어내립니다. 하늘에서는 그쪽으로 미끄러져 내려갑니다. */
function thinkAir(m: Match, p: Player, b: BotBrain, dt: number): void {
  const inp = p.input, f = m.flight, rng = m.rng;
  inp.mx = 0; inp.mz = 0; inp.jump = false; inp.fire = false;
  if (Number.isNaN(b.dropX) && f) {
    // 큰 마을일수록 자주 고릅니다. 일부는 들판·숲에 조용히 내립니다.
    const cs = m.map.compounds, w = cs.map(c => (c.kind === 'city' ? 3 : c.kind === 'military' ? 2.6 : 1.3)), sum = w.reduce((s, v) => s + v, 0);
    let x = 0, z = 0;
    if (cs.length && rng() < 0.5) { let r = rng() * sum, i = 0; for (; i < cs.length - 1; i++) { r -= w[i]; if (r <= 0) break; } x = cs[i].x + (rng() - 0.5) * cs[i].r * 1.2; z = cs[i].z + (rng() - 0.5) * cs[i].r * 1.2; }
    else { x = (rng() - 0.5) * m.map.half * 1.6; z = (rng() - 0.5) * m.map.half * 1.6; }
    // 항로에서 너무 먼 곳은 닿을 수 있는 거리로 당깁니다.
    const s = (x - f.ax) * f.dx + (z - f.az) * f.dz, px = f.ax + f.dx * s, pz = f.az + f.dz * s, lx = x - px, lz = z - pz, lat = Math.hypot(lx, lz), reach = 230 + rng() * 60;
    if (lat > reach) { x = px + (lx / lat) * reach; z = pz + (lz / lat) * reach; }
    b.dropX = clamp(x, -m.map.half + 30, m.map.half - 30); b.dropZ = clamp(z, -m.map.half + 30, m.map.half - 30);
    b.dropS = clamp(s - Math.min(lat, reach) * (0.35 + rng() * 0.25), 30, f.len - 30);
  }
  if (p.air === 1) {
    const pl = m.planeAt(m.t); if (pl && f && pl.k * f.len >= b.dropS) inp.jump = true;
    inp.yaw = p.yaw; inp.pitch = 0; return;
  }
  const dx = b.dropX - p.x, dz = b.dropZ - p.z, d = Math.hypot(dx, dz), alt = p.y - groundAt(m.map.terrain, p.x, p.z);
  const yawT = Math.atan2(dz, dx), step = 9 * dt; p.yaw += clamp(angDiff(yawT, p.yaw), -step, step);
  inp.yaw = p.yaw;
  if (p.air === 2) { inp.mz = 1; inp.pitch = d < alt * 0.45 ? -1.0 : -0.2; }
  else { inp.mz = d > 12 ? 1 : d > 4 ? 0.3 : -0.3; inp.pitch = -0.3; }
}

/** 이 선수가 서 있는 건물(위층에 있을 때 계단을 찾으려고 씁니다). */
function buildingAt(m: Match, x: number, z: number): Building | null {
  for (const b of m.map.buildings) if (Math.abs(x - b.x) < b.w / 2 + 0.3 && Math.abs(z - b.z) < b.d / 2 + 0.3) return b;
  return null;
}

export function thinkBot(m: Match, p: Player, dt: number, zone: ZoneState): void {
  const b = p.brain!, T = b.t, inp = p.input, rng = m.rng, eye = eyeOf(p);
  inp.fire = false; inp.reload = false; inp.interact = false; inp.sprint = false; inp.ads = false; inp.slot = -1; inp.mx = 0; inp.mz = 0; inp.jump = false;
  if (p.air !== 0) { thinkAir(m, p, b, dt); return; }
  b.goalT -= dt; b.investT -= dt; b.strafeT -= dt; b.errT -= dt; b.detourT -= dt; b.lootT -= dt; b.think -= dt; b.lootScan -= dt;

  // ---- 주변 살피기 (0.12~0.2초마다) ----
  if (b.think <= 0) {
    b.think = 0.12 + rng() * 0.08;
    let best: Player | null = null, bestD = Infinity;
    for (const q of m.players) {
      if (!q.alive || q.id === p.id || q.air !== 0) continue;
      const dx = q.x - p.x, dz = q.z - p.z; if (Math.abs(dx) > T.sight || Math.abs(dz) > T.sight) continue; const d = Math.hypot(dx, dz); if (d > T.sight || d >= bestD) continue;
      const retaliate = p.hurt > 0 && p.lastHitBy === q.id;
      // 권총뿐이라면 먼 적과는 싸우지 않고 총부터 찾습니다.
      if (!retaliate && d > 22 && !p.guns[1] && p.guns[0]?.id === 'pistol') continue;
      if (!retaliate && d > 9 && Math.abs(angDiff(Math.atan2(dz, dx), p.yaw)) > T.fov) continue;
      // 앉은 적이 먼 덤불·풀숲에 있으면 잘 보이지 않습니다.
      if (q.crouch && d > T.sight * 0.6 && !retaliate) continue;
      if (lineClear(m.map, p.x, eye, p.z, q.x, q.y + (q.crouch ? 0.8 : 1.2), q.z)) { best = q; bestD = d; }
    }
    if (best) {
      if (b.target !== best.id) { b.target = best.id; b.react = T.react * (0.7 + rng() * 0.6); b.head = rng() < T.headAim; b.low = T.strafe >= 0.8 && rng() < 0.45; }
      b.seen = 0; b.lastX = best.x; b.lastZ = best.z; b.lastY = best.y;
    } else { b.seen += 0.16; if (b.target >= 0 && b.seen > 7 + T.react * 3) b.target = -1; }
    if (b.target < 0 && b.investT <= 0) {
      for (const s of m.sounds) if (s.by !== p.id && m.t - s.t < 1.2 && Math.hypot(s.x - p.x, s.z - p.z) < Math.min(s.range, 38 + T.sight * 0.35)) { b.investX = s.x; b.investZ = s.z; b.investT = 6; break; }
      if (p.hurt > 0 && b.investT <= 0) { b.investX = p.x + Math.cos(p.hurtYaw) * 14; b.investZ = p.z + Math.sin(p.hurtYaw) * 14; b.investT = 5; }
    }
  }
  const tq = b.target >= 0 ? m.players[b.target] : undefined, q = tq && tq.alive && tq.air === 0 ? tq : null; if (!q) b.target = -1;
  const visible = !!q && b.seen < 0.35, gun = p.guns[p.cur], def = gun ? WEAPONS[gun.id] : null;

  // ---- 무기 고르기·장전 ----
  if (gun && def) {
    if (gun.mag === 0 && gun.reserve > 0) inp.reload = true;
    else if (!visible && gun.mag < def.mag * 0.4 && gun.reserve > 0) inp.reload = true;
    const o = 1 - p.cur, og = p.guns[o];
    if (gun.mag === 0 && gun.reserve === 0 && og && (og.mag > 0 || og.reserve > 0)) inp.slot = o;
    if (visible && q && og && og.mag > 0) {
      const d = Math.hypot(q.x - p.x, q.z - p.z), fit = (id: string): number => Math.abs((IDEAL[id] ?? 20) - d);
      if (fit(og.id) + 12 < fit(gun.id)) inp.slot = o;
    }
  }

  // ---- 시선과 조준 ----
  let yawTarget = p.yaw, pitchTarget = 0, turn = T.turn * 0.55;
  const engaged = !!q && (visible || b.seen < 1.2);
  inp.crouch = false;
  if (q && engaged) {
    const tx = visible ? q.x : b.lastX, tz = visible ? q.z : b.lastZ, tyBase = visible ? q.y : b.lastY, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) + 1e-6;
    const ty = tyBase + (q.crouch ? (b.head ? 1.05 : 0.75) : b.head ? 1.62 : 1.15);
    if (b.errT <= 0) { b.errT = 0.22 + rng() * 0.15; const k = T.aimErr * (1 + d / 55); b.errYaw = gauss(rng) * k; b.errPitch = gauss(rng) * k * 0.7; }
    yawTarget = Math.atan2(dz, dx) + b.errYaw; pitchTarget = Math.atan2(ty - eye, d) + b.errPitch; turn = T.turn;
    if (visible && def && gun) {
      b.react -= dt;
      const dy = Math.abs(angDiff(yawTarget, p.yaw)), tol = Math.max(0.03, Math.atan2(0.42, d) * 1.5), inRange = d < Math.min(def.range * 0.85, (IDEAL[def.id] ?? 20) * 1.7) && !(def.id === 'sniper' && d < 14);
      if (b.react <= 0 && dy < tol && inRange && p.reload <= 0) {
        if (def.auto) {
          if (b.pauseT > 0) b.pauseT -= dt;
          else { inp.fire = true; b.burstT -= dt; if (b.burstT <= 0) { b.pauseT = T.pause * (0.7 + rng() * 0.6); b.burstT = T.burst * (0.6 + rng() * 0.8); } }
        } else inp.fire = true;
      }
      inp.ads = d > 30 && T.aimErr < 0.03;
      inp.crouch = b.low && d > 22 && p.wet < 0.5;
    }
  } else if (b.investT > 0) yawTarget = Math.atan2(b.investZ - p.z, b.investX - p.x);

  // ---- 이동 목표 ----
  let moveYaw: number | null = null, run = false;
  const ground = groundAt(m.map.terrain, p.x, p.z), upstairs = p.y > ground + 2.2;
  if (q && visible && def) {
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), ideal = IDEAL[def.id] ?? 20, toward = Math.atan2(dz, dx);
    if (b.strafeT <= 0) { b.strafeT = 0.5 + rng() * 1.2; b.strafe = rng() < 0.5 ? 1 : -1; }
    if (d > ideal * 1.35 && !upstairs) { moveYaw = toward + (T.strafe > 0.6 ? b.strafe * 0.35 : 0); run = d > 45; }
    else if (d < ideal * 0.55 && def.id !== 'shotgun') moveYaw = toward + Math.PI + b.strafe * 0.3;
    else if (T.strafe > 0) moveYaw = toward + b.strafe * Math.PI / 2;
  } else {
    const dist = Math.hypot(p.x - zone.cx, p.z - zone.cz), soon = !zone.shrinking && zone.timeLeft < 16 + T.zoneMargin * 0.4;
    const nextDist = Math.hypot(p.x - zone.nextCx, p.z - zone.nextCz);
    const outsideNow = dist > zone.r - T.zoneMargin, outsideNext = soon && nextDist > zone.nextR - T.zoneMargin, late = zone.phase >= 3 && nextDist > zone.nextR * 0.55;
    if (outsideNow || outsideNext || late) {
      b.goalX = zone.nextCx + b.offX * zone.nextR * 0.5; b.goalZ = zone.nextCz + b.offZ * zone.nextR * 0.5; b.goalT = 1; b.lootId = -1; run = true;
    } else if (q && !visible) {
      // 놓친 적을 마지막으로 본 곳까지 쫓아갑니다
      b.goalX = b.lastX; b.goalZ = b.lastZ; b.goalT = 0.3; b.lootId = -1; if (Math.hypot(b.lastX - p.x, b.lastZ - p.z) < 3) b.target = -1;
    } else {
      if (b.lootId >= 0) { const l = m.lootOf(b.lootId); if (!l || l.taken || b.lootT <= 0) { if (l && !l.taken) b.skip.add(l.id); b.lootId = -1; } }
      if (b.lootId < 0 && b.lootScan <= 0) {
        b.lootScan = 0.5 + rng() * 0.3;
        let bl = -1, bs = 0;
        for (const l of m.loot) {
          if (l.taken) continue; const ddx = l.x - p.x, ddz = l.z - p.z; if (Math.abs(ddx) > T.lootRadius || Math.abs(ddz) > T.lootRadius || b.skip.has(l.id)) continue;
          const d = Math.hypot(ddx, ddz); if (d > T.lootRadius) continue;
          // 계단이 없는 높은 곳의 전리품은 건너뜁니다.
          if (l.y > p.y + 1.6 && !(l.b >= 0 && m.map.buildings[l.b]?.stairs)) continue;
          const w = wantLoot(p, l.kind, l.weapon); if (w <= 0) continue; const s = w / (1 + d / 28 + Math.abs(l.y - p.y) / 6); if (s > bs) { bs = s; bl = l.id; }
        }
        if (bl >= 0) { b.lootId = bl; b.lootT = 20; }
      }
      const l = b.lootId >= 0 ? m.lootOf(b.lootId) : null;
      if (l) {
        b.goalX = l.x; b.goalZ = l.z; b.goalT = 0.3;
        const st = l.b >= 0 ? m.map.buildings[l.b]?.stairs : null;
        if (st && l.y > p.y + 1.6) {
          // 위층 전리품: 계단 아래 → 계단 위 → 전리품
          const nearBottom = Math.hypot(st.bx - p.x, st.bz - p.z) < 1.4, onStairs = p.y > l.y - 3.5 && p.y < l.y - 0.4 && Math.hypot(st.tx - p.x, st.tz - p.z) < 7.5;
          if (nearBottom || onStairs) { b.goalX = st.tx; b.goalZ = st.tz; } else { b.goalX = st.bx; b.goalZ = st.bz; }
        } else if (l.y < p.y - 1.6) {
          const here = buildingAt(m, p.x, p.z);
          if (here?.stairs) { const nearTop = Math.hypot(here.stairs.tx - p.x, here.stairs.tz - p.z) < 1.4 || p.y < here.stairs.top - 0.4; b.goalX = nearTop ? here.stairs.bx : here.stairs.tx; b.goalZ = nearTop ? here.stairs.bz : here.stairs.tz; }
        }
        if (l.kind === 'weapon' && Math.hypot(l.x - p.x, l.z - p.z) < PLAYER.pickup - 0.35 && Math.abs(l.y - p.y) < 1.2) inp.interact = true;
      }
      else if (b.investT > 0 && Math.hypot(b.investX - p.x, b.investZ - p.z) > 3) { b.goalX = b.investX; b.goalZ = b.investZ; b.goalT = 0.3; }
      else if (b.goalT <= 0 || Math.hypot(b.goalX - p.x, b.goalZ - p.z) < 2.2) {
        // 어슬렁거리기: 다음 원 안쪽의 한 점으로
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * zone.nextR * 0.8;
        b.goalX = zone.nextCx + Math.cos(a) * r; b.goalZ = zone.nextCz + Math.sin(a) * r; b.goalT = 6 + rng() * 6;
      }
    }
    // 위층에 있는데 바깥으로 나가야 하면 먼저 계단으로 내려갑니다.
    if (upstairs && !(b.lootId >= 0 && Math.abs((m.lootOf(b.lootId)?.y ?? -99) - p.y) < 1.2)) {
      const here = buildingAt(m, p.x, p.z), st = here?.stairs;
      if (st && Math.hypot(b.goalX - here!.x, b.goalZ - here!.z) > Math.max(here!.w, here!.d) / 2) {
        const nearTop = Math.hypot(st.tx - p.x, st.tz - p.z) < 1.4 || p.y < st.top - 0.4; b.goalX = nearTop ? st.bx : st.tx; b.goalZ = nearTop ? st.bz : st.tz;
      }
    }
    const dx = b.goalX - p.x, dz = b.goalZ - p.z, d = Math.hypot(dx, dz);
    if (d > 1.1) {
      moveYaw = Math.atan2(dz, dx); run = run || d > 14;
      // 곧장 갈 수 없으면 길을 찾아 모서리를 따라갑니다. 먼 목표는 앞쪽 40m 지점까지만 찾고 이어 갑니다.
      const nav = navFor(m.map); b.planT -= dt;
      const far = d > 46, sx = far ? p.x + (dx / d) * 40 : b.goalX, sz = far ? p.z + (dz / d) * 40 : b.goalZ;
      if (b.planT <= 0) {
        b.planT = 0.5 + rng() * 0.2;
        if (walkable(nav, p.x, p.z, sx, sz)) b.path = null;
        else if (!b.path || Math.hypot(b.pathGx - b.goalX, b.pathGz - b.goalZ) > 3 || b.stuck >= 2) { b.path = findPath(nav, p.x, p.z, sx, sz, far ? 9000 : 16000) ?? []; b.pathIdx = 0; b.pathGx = b.goalX; b.pathGz = b.goalZ; }
      }
      if (b.path && b.path.length) {
        while (b.pathIdx * 2 < b.path.length && Math.hypot(b.path[b.pathIdx * 2] - p.x, b.path[b.pathIdx * 2 + 1] - p.z) < 1.1) b.pathIdx++;
        if (b.pathIdx * 2 < b.path.length) moveYaw = Math.atan2(b.path[b.pathIdx * 2 + 1] - p.z, b.path[b.pathIdx * 2] - p.x); else { b.path = null; b.planT = 0; }
      }
    }
  }

  if (inp.fire && !(T.strafe >= 1 && def?.auto)) moveYaw = null; // 쏘는 동안에는 멈춰서 맞힙니다(가장 높은 난이도는 움직이며 쏩니다)

  // ---- 막힘 감지: 0.5초마다 위치를 재서 거의 안 움직였으면 옆으로 돌아가거나 뛰어넘어 봅니다 ----
  b.probeT -= dt;
  if (b.probeT <= 0) {
    b.probeT = 0.5; b.hop = false;
    if (moveYaw !== null && Math.hypot(p.x - b.probeX, p.z - b.probeZ) < 0.35) {
      b.stuck++; b.detourT = 0.9 + rng() * 0.6; b.detourDir = rng() < 0.5 ? 1 : -1; b.hop = b.stuck % 2 === 1;
      if (b.stuck > 4) { b.goalT = 0; if (b.lootId >= 0) b.skip.add(b.lootId); b.lootId = -1; b.stuck = 0; b.path = null; }
    } else if (moveYaw !== null) b.stuck = Math.max(0, b.stuck - 0.5);
    b.probeX = p.x; b.probeZ = p.z;
  }
  if (moveYaw !== null && b.detourT > 0) moveYaw += b.detourDir * 1.3;
  if (b.hop && p.grounded) { inp.jump = true; b.hop = false; }

  // ---- 입력 만들기: 시선은 제한된 속도로 돌고, 이동은 월드 방향을 시선 기준으로 바꿉니다 ----
  if (!engaged && b.investT <= 0 && moveYaw !== null) yawTarget = moveYaw;
  const step = turn * dt, dyaw = angDiff(yawTarget, p.yaw); p.yaw += clamp(dyaw, -step, step);
  p.pitch += clamp(pitchTarget - p.pitch, -step * 0.8, step * 0.8);
  inp.yaw = p.yaw; inp.pitch = p.pitch;
  if (moveYaw !== null) {
    const rel = angDiff(moveYaw, p.yaw); inp.mz = Math.cos(rel); inp.mx = Math.sin(rel);
    inp.sprint = run && Math.abs(rel) < 0.6 && !visible;
  }
}
