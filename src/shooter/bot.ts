// ZERO ZONE — 봇 AI. 난이도(config.BOTS)에 따라 반응 속도·조준 오차·회전 속도·시야·자기장 대응이 달라집니다.
// 봇은 사람과 같은 입력(Input)만 만들어 내고, 체력이나 탄을 속이지 않습니다.
import { PART_FITS, magOf, partFit, PARTS, PLAYER, WEAPONS, type BotTuning, type PartId } from './config';
import { lineClear } from './world';
import { findPath, navFor, walkable } from './nav';
import type { Match, Player, ZoneState } from './sim';

export interface BotBrain {
  t: BotTuning; think: number; target: number; seen: number; react: number; lastX: number; lastZ: number;
  goalX: number; goalZ: number; goalT: number; lootId: number; lootT: number; skip: Set<number>;
  offX: number; offZ: number; stuck: number; detourT: number; detourDir: number; probeT: number; probeX: number; probeZ: number;
  strafe: number; strafeT: number; errYaw: number; errPitch: number; errT: number; burstT: number; pauseT: number; head: boolean;
  investX: number; investZ: number; investT: number;
  path: number[] | null; pathIdx: number; pathGx: number; pathGz: number; planT: number;
  /** 생각하지 않고 쌓인 시간 · 낙하 계획(목표 지점, 뛰는 거리, 낙하산 펴는 고도, 지난 거리) · 전리품 탐색 쿨다운 */
  acc: number; dropX: number; dropZ: number; jumpDist: number; openAlt: number; lastD: number; lootScan: number;
}
export function newBrain(rng: () => number, t: BotTuning): BotBrain {
  const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.6;
  return {
    t, think: rng() * 0.2, target: -1, seen: 99, react: 0, lastX: 0, lastZ: 0, goalX: 0, goalZ: 0, goalT: 0, lootId: -1, lootT: 0, skip: new Set(), offX: Math.cos(a) * r, offZ: Math.sin(a) * r,
    stuck: 0, detourT: 0, detourDir: 1, probeT: 0, probeX: 0, probeZ: 0, strafe: 1, strafeT: 0, errYaw: 0, errPitch: 0, errT: 0, burstT: 0, pauseT: 0, head: false, investX: 0, investZ: 0, investT: 0,
    path: null, pathIdx: 0, pathGx: 0, pathGz: 0, planT: 0, acc: 0, dropX: 0, dropZ: 0, jumpDist: 200, openAlt: 130, lastD: Infinity, lootScan: 0,
  };
}

const angDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const gauss = (rng: () => number): number => (rng() + rng() + rng() - 1.5) / 0.75;
/** 무기별로 싸우기 좋은 거리 */
const IDEAL: Record<string, number> = { shotgun: 8, smg: 16, pistol: 18, rifle: 32, sniper: 70 };

function wantLoot(p: Player, kind: string, weapon: string | null, part: PartId | null): number {
  if (kind === 'medkit') return p.hp < 85 ? 3 + (100 - p.hp) / 20 : 0;
  if (kind === 'armor') return p.armor < 50 ? 2.6 : 0;
  if (kind === 'helmet') return p.helmet < 3 ? 2.2 : 0;
  if (kind === 'boost') return p.boost <= 0 && p.hp < 95 ? 1.6 : 0;
  if (kind === 'attach') return part && p.guns.some(g => { if (!g || !PART_FITS[g.id].includes(PARTS[part].slot)) return false; const f = partFit(g.att, part); return f === 'new' || f === 'upgrade'; }) ? 1.4 : 0;
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

export function thinkBot(m: Match, p: Player, dt: number, zone: ZoneState): void {
  const b = p.brain!, T = b.t, inp = p.input, rng = m.rng, eye = PLAYER.eye;
  inp.fire = false; inp.reload = false; inp.interact = false; inp.sprint = false; inp.ads = false; inp.slot = -1; inp.mx = 0; inp.mz = 0;
  b.goalT -= dt; b.investT -= dt; b.strafeT -= dt; b.errT -= dt; b.detourT -= dt; b.lootT -= dt; b.think -= dt; b.lootScan -= dt;

  // ---- 주변 살피기 (0.12~0.2초마다) ----
  if (b.think <= 0) {
    b.think = 0.12 + rng() * 0.08;
    let best: Player | null = null, bestD = Infinity;
    // 낙하 직후 권총뿐일 때는 먼저 무기부터 찾습니다: 가까이 오거나 맞기 전에는 먼 적과 싸우지 않습니다.
    const cautious = m.plane !== null && !p.guns.some(g => g && g.id !== 'pistol') && m.t - p.landedAt < 45;
    for (const q of m.players) {
      if (!q.alive || q.id === p.id || q.air) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d > T.sight) continue;
      const retaliate = p.hurt > 0 && p.lastHitBy === q.id;
      if (cautious && !retaliate && d > 9) continue;
      if (!retaliate && d > 9 && Math.abs(angDiff(Math.atan2(dz, dx), p.yaw)) > T.fov) continue;
      if (d < bestD && lineClear(m.map, p.x, eye, p.z, q.x, 1.2, q.z)) { best = q; bestD = d; }
    }
    if (best) {
      if (b.target !== best.id) { b.target = best.id; b.react = T.react * (0.7 + rng() * 0.6); b.head = rng() < T.headAim; }
      b.seen = 0; b.lastX = best.x; b.lastZ = best.z;
    } else { b.seen += 0.16; if (b.target >= 0 && b.seen > 7 + T.react * 3) b.target = -1; }
    if (b.target < 0 && b.investT <= 0 && !cautious) {
      for (const s of m.sounds) if (s.by !== p.id && m.t - s.t < 1.2 && Math.hypot(s.x - p.x, s.z - p.z) < (38 + T.sight * 0.35) * (s.quiet ? 0.3 : 1)) { b.investX = s.x; b.investZ = s.z; b.investT = 6; break; }
      if (p.hurt > 0 && b.investT <= 0) { b.investX = p.x + Math.cos(p.hurtYaw) * 14; b.investZ = p.z + Math.sin(p.hurtYaw) * 14; b.investT = 5; }
    }
  }
  const tq = b.target >= 0 ? m.players[b.target] : undefined, q = tq && tq.alive ? tq : null; if (!q) b.target = -1;
  const visible = !!q && b.seen < 0.35, gun = p.guns[p.cur], def = gun ? WEAPONS[gun.id] : null;

  // ---- 무기 고르기·장전 ----
  if (gun && def) {
    if (gun.mag === 0 && gun.reserve > 0) inp.reload = true;
    else if (!visible && gun.mag < magOf(def.id, gun.att) * 0.4 && gun.reserve > 0) inp.reload = true;
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
  if (q && engaged) {
    const tx = visible ? q.x : b.lastX, tz = visible ? q.z : b.lastZ, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) + 1e-6, ty = b.head ? 1.62 : 1.15;
    if (b.errT <= 0) { b.errT = 0.22 + rng() * 0.15; const k = T.aimErr * (1 + d / 55) * (q.bot && m.plane ? 2.2 : 1); /* 100명 판: AI끼리는 덜 정확해 초반에 다 쓰러지지 않습니다 */ b.errYaw = gauss(rng) * k; b.errPitch = gauss(rng) * k * 0.7; }
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
    }
  } else if (b.investT > 0) yawTarget = Math.atan2(b.investZ - p.z, b.investX - p.x);

  // ---- 이동 목표 ----
  let moveYaw: number | null = null, run = false;
  if (q && visible && def) {
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), ideal = IDEAL[def.id] ?? 20, toward = Math.atan2(dz, dx);
    if (b.strafeT <= 0) { b.strafeT = 0.5 + rng() * 1.2; b.strafe = rng() < 0.5 ? 1 : -1; }
    if (d > ideal * 1.35) { moveYaw = toward + (T.strafe > 0.6 ? b.strafe * 0.35 : 0); run = d > 45; }
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
      if (b.lootId >= 0) { const l = m.loot.find(x => x.id === b.lootId); if (!l || l.taken || b.lootT <= 0) { if (l && !l.taken) b.skip.add(l.id); b.lootId = -1; } }
      if (b.lootId < 0 && b.lootScan <= 0) {
        b.lootScan = 0.35 + rng() * 0.3; let bl = -1, bs = 0;
        for (const l of m.loot) {
          if (l.taken || b.skip.has(l.id)) continue; const d = Math.hypot(l.x - p.x, l.z - p.z); if (d > T.lootRadius) continue;
          const w = wantLoot(p, l.kind, l.weapon, l.part ?? null); if (w <= 0) continue; const s = w / (1 + d / 28); if (s > bs) { bs = s; bl = l.id; }
        }
        if (bl >= 0) { b.lootId = bl; b.lootT = 18; }
      }
      const l = b.lootId >= 0 ? m.loot.find(x => x.id === b.lootId) : null;
      if (l) { b.goalX = l.x; b.goalZ = l.z; b.goalT = 0.3; if (l.kind === 'weapon' && Math.hypot(l.x - p.x, l.z - p.z) < PLAYER.pickup - 0.35) inp.interact = true; }
      else if (b.investT > 0 && Math.hypot(b.investX - p.x, b.investZ - p.z) > 3) { b.goalX = b.investX; b.goalZ = b.investZ; b.goalT = 0.3; }
      else if (b.goalT <= 0 || Math.hypot(b.goalX - p.x, b.goalZ - p.z) < 2.2) {
        // 어슬렁거리기: 다음 원 안쪽의 한 점으로
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * zone.nextR * 0.8;
        b.goalX = zone.nextCx + Math.cos(a) * r; b.goalZ = zone.nextCz + Math.sin(a) * r; b.goalT = 6 + rng() * 6;
      }
    }
    const dx = b.goalX - p.x, dz = b.goalZ - p.z, d = Math.hypot(dx, dz);
    if (d > 1.1) {
      moveYaw = Math.atan2(dz, dx); run = run || d > 14;
      // 곧장 갈 수 없으면 길을 찾아 모서리를 따라갑니다.
      const nav = navFor(m.map); b.planT -= dt;
      if (b.planT <= 0) {
        b.planT = 0.5 + rng() * 0.2;
        if (walkable(nav, p.x, p.z, b.goalX, b.goalZ)) b.path = null;
        else if (!b.path || Math.hypot(b.pathGx - b.goalX, b.pathGz - b.goalZ) > 3 || b.stuck >= 2) { b.path = findPath(nav, p.x, p.z, b.goalX, b.goalZ) ?? []; b.pathIdx = 0; b.pathGx = b.goalX; b.pathGz = b.goalZ; }
      }
      if (b.path && b.path.length) {
        while (b.pathIdx * 2 < b.path.length && Math.hypot(b.path[b.pathIdx * 2] - p.x, b.path[b.pathIdx * 2 + 1] - p.z) < 1.1) b.pathIdx++;
        if (b.pathIdx * 2 < b.path.length) moveYaw = Math.atan2(b.path[b.pathIdx * 2 + 1] - p.z, b.path[b.pathIdx * 2] - p.x); else b.path = null;
      }
    }
  }

  if (inp.fire) moveYaw = null; // 쏘는 동안에는 멈춰서 맞힙니다(움직이는 건 쉬는 사이)

  // ---- 막힘 감지: 0.5초마다 위치를 재서 거의 안 움직였으면 옆으로 돌아갑니다 ----
  b.probeT -= dt;
  if (b.probeT <= 0) {
    b.probeT = 0.5;
    if (moveYaw !== null && Math.hypot(p.x - b.probeX, p.z - b.probeZ) < 0.35) {
      b.stuck++; b.detourT = 0.9 + rng() * 0.6; b.detourDir = rng() < 0.5 ? 1 : -1;
      if (b.stuck > 4) { b.goalT = 0; if (b.lootId >= 0) b.skip.add(b.lootId); b.lootId = -1; b.stuck = 0; }
    } else if (moveYaw !== null) b.stuck = Math.max(0, b.stuck - 0.5);
    b.probeX = p.x; b.probeZ = p.z;
  }
  if (moveYaw !== null && b.detourT > 0) moveYaw += b.detourDir * 1.3;

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

/** 비행기 안·낙하 중인 봇: 목표 지점에 가까워지면 뛰고, 목표를 향해 활강하다가 낙하산을 펴고 내립니다. */
export function thinkAir(m: Match, p: Player): void {
  const b = p.brain!, inp = p.input, dx = b.dropX - p.x, dz = b.dropZ - p.z, d = Math.hypot(dx, dz);
  inp.jump = false; inp.sprint = false; inp.mx = 0; inp.mz = 0; inp.fire = false;
  if (p.air === 1) {
    // 가장 가까이 지나가는 순간(거리가 다시 늘기 시작할 때)에는 반드시 뜁니다
    if (d < b.jumpDist || d > b.lastD + 0.5) inp.jump = true; b.lastD = d; p.yaw = Math.atan2(m.plane!.dz, m.plane!.dx); inp.yaw = p.yaw; return;
  }
  const want = Math.atan2(dz, dx), step = 2.2 * (1 / 60); p.yaw += clamp(angDiff(want, p.yaw), -step * 3, step * 3); inp.yaw = p.yaw; inp.pitch = p.pitch = 0;
  if (p.air === 2) { inp.mz = 1; if (p.alt < b.openAlt) inp.jump = true; return; }
  if (d > 70) inp.mz = 1; else if (d > 12) inp.mz = Math.min(1, d / 60 + 0.25); // 가까워지면 속도를 줄여 목표 위에서 내립니다
}
