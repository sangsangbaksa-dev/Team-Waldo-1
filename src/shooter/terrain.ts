// ZERO ZONE — 지형 계획: 강·호수·늪·구릉·절벽·숲을 시드로 정합니다. 화면과 무관한 순수 데이터라 어디서나 같은 지형이 나옵니다.
// 충돌(구릉·절벽은 world.ts 가 상자로 만듦)과 물 속도 저하(waterDepth)가 이 데이터를 씁니다.
import { makeRng, type Mode } from './config';

/** 속이 꽉 찬 바위 언덕. 올라갈 수는 없지만 시선과 총알을 막는 큰 엄폐물입니다. */
export interface Hill { x: number; z: number; r: number; h: number }
/** 밟고 올라갈 수 있는 완만한 지형 고도. 경계에서는 높이와 기울기가 0이 됩니다. */
export interface Rise { x: number; z: number; r: number; h: number }
/** 호수(swamp=false)와 늪(swamp=true). 타원이며 ry 만큼 돌아 있습니다. */
export interface Pond { x: number; z: number; rx: number; rz: number; ry: number; swamp: boolean }
export interface River { pts: Array<[number, number]>; w: number }
/** 축에 나란한 절벽 한 토막(문틈 사이사이로 쪼개져 있음). */
export interface Cliff { x0: number; z0: number; x1: number; z1: number; h: number }
export interface Forest { x: number; z: number; r: number }
/** 길이 물을 건너는 자리: 다리 위는 물 속도 저하가 없습니다. */
export interface Bridge { x: number; z: number; ry: number; len: number }
export interface Terrain { hills: Hill[]; rises: Rise[]; ponds: Pond[]; rivers: River[]; cliffs: Cliff[]; forests: Forest[]; bridges: Bridge[] }
export const emptyTerrain = (): Terrain => ({ hills: [], rises: [], ponds: [], rivers: [], cliffs: [], forests: [], bridges: [] });

/** 유한하고 매끄러운 언덕 프로필. 경계에서 0으로 수렴하므로 기지/도로 경계에 단차가 없습니다. */
export function riseHeight(r: Rise, x: number, z: number): number {
  const dx = (x - r.x) / r.r, dz = (z - r.z) / r.r;
  const d2 = dx * dx + dz * dz;
  return d2 >= 1 ? 0 : r.h * (1 - d2) ** 2;
}

/** (x,z)의 실제 지면 고도. 순수 시드 데이터만 사용하며, 렌더링과 전투 판정이 공유합니다. */
export function groundHeight(t: Terrain, x: number, z: number): number {
  let y = 0;
  for (const r of t.rises) y = Math.max(y, riseHeight(r, x, z));
  return y;
}

/** 지면과 광선의 최초 교차점. 납작한 기본 땅과 완만한 능선을 모두 검사합니다.
 * 능선과 만나는 XZ 구간만 샘플링하고, 최초 교차는 이분탐색해 총알이 산을 뚫지 않게 합니다. */
export function groundRayDistance(t: Terrain, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  let best = dy < -1e-9 && oy >= 0 ? oy / -dy : Infinity;
  if (best > maxT) best = Infinity;
  const horizSq = dx * dx + dz * dz;
  for (const r of t.rises) {
    const rx = ox - r.x, rz = oz - r.z, b = rx * dx + rz * dz;
    let from = 0, to = Math.min(maxT, best);
    if (horizSq > 1e-12) {
      const disc = b * b - horizSq * (rx * rx + rz * rz - r.r * r.r);
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      from = Math.max(0, (-b - root) / horizSq);
      to = Math.min(to, (-b + root) / horizSq);
    } else if (rx * rx + rz * rz >= r.r * r.r) continue;
    if (to < from) continue;
    const above = (d: number): number => oy + dy * d - riseHeight(r, ox + dx * d, oz + dz * d);
    let previousT = from, previousY = above(from);
    if (previousY <= 0) { best = Math.min(best, from); continue; }
    const n = Math.max(1, Math.ceil((to - from) / Math.max(0.5, r.r / 24)));
    for (let i = 1; i <= n; i++) {
      const at = from + (to - from) * i / n, altitude = above(at);
      if (altitude <= 0) {
        let low = previousT, high = at;
        for (let k = 0; k < 16; k++) {
          const mid = (low + high) / 2;
          if (above(mid) <= 0) high = mid; else low = mid;
        }
        best = Math.min(best, high);
        break;
      }
      previousT = at; previousY = altitude;
    }
    void previousY;
  }
  return best;
}

/** 물에서 걸을 때 속도 배율: [뭍, 얕은 물(강·늪), 깊은 물(호수 가운데)] */
export const WATER_SLOW = [1, 0.62, 0.42] as const;
export const CLIFF_T = 3.4;

const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
};
/** 점에서 강 물줄기 가장자리까지의 거리(물 안이면 음수). */
function riverEdge(rivers: River[], x: number, z: number): number {
  let best = Infinity;
  for (const r of rivers) for (let i = 0; i + 1 < r.pts.length; i++) { const d = segDist(x, z, r.pts[i][0], r.pts[i][1], r.pts[i + 1][0], r.pts[i + 1][1]) - r.w / 2; if (d < best) best = d; }
  return best;
}
/** (x,z) 지점의 물 깊이 0 뭍 · 1 얕음 · 2 깊음. withBridges=false 면 다리를 무시한 본래 물. */
export function waterDepth(t: Terrain, x: number, z: number, withBridges = true): 0 | 1 | 2 {
  let d: 0 | 1 | 2 = 0;
  if (t.rivers.length && riverEdge(t.rivers, x, z) < 0) d = 1;
  for (const p of t.ponds) {
    const c = Math.cos(p.ry), s = Math.sin(p.ry), dx = x - p.x, dz = z - p.z, u = (dx * c + dz * s) / p.rx, v = (-dx * s + dz * c) / p.rz, q = u * u + v * v;
    if (q < 1) { const k: 1 | 2 = p.swamp || q > 0.6 ? 1 : 2; if (k > d) d = k; }
  }
  if (d && withBridges) for (const b of t.bridges) { const c = Math.cos(b.ry), s = Math.sin(b.ry), dx = x - b.x, dz = z - b.z; if (Math.abs(dx * c + dz * s) < b.len / 2 && Math.abs(-dx * s + dz * c) < 2.7) return 0; }
  return d;
}

/** Chaikin 방식으로 각을 둥글려 강이 굽이치게 합니다. */
function smooth(pts: Array<[number, number]>, rounds: number): Array<[number, number]> {
  let p = pts;
  for (let k = 0; k < rounds; k++) { const q: Array<[number, number]> = [p[0]]; for (let i = 0; i + 1 < p.length; i++) { const [ax, az] = p[i], [bx, bz] = p[i + 1]; q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]); } q.push(p[p.length - 1]); p = q; }
  return p;
}

interface Zone { x: number; z: number; r: number }
export interface Rect { x0: number; z0: number; x1: number; z1: number }
/** 원(x,z,rad)과 직사각형 사이 빈 거리가 gap 보다 작은지. */
const nearRect = (blocks: Rect[], x: number, z: number, rad: number, gap: number): boolean => {
  for (const b of blocks) { const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1); if (dx * dx + dz * dz < (rad + gap) * (rad + gap)) return true; }
  return false;
};
/** blocks: 마을·시설에서 이미 세워진 모든 충돌 상자. 지형은 이 상자들과 절대 겹치지 않게(여유 gap 이상) 자리를 잡습니다. */
export function planTerrain(seed: number, mode: Mode, half: number, towns: Zone[], sites: Zone[], roads: Array<[Zone, Zone]>, blocks: Rect[] = []): Terrain {
  const rng = makeRng((seed ^ 0x51f15e) >>> 0), t = emptyTerrain(), br = mode === 'br', feats: Zone[] = [];
  /** 이 둥근 자리가 마을·시설·길·다른 지형과 겹치지 않는지 */
  const free = (x: number, z: number, rad: number, pad = 6): boolean =>
    Math.abs(x) < half - rad - 4 && Math.abs(z) < half - rad - 4 &&
    towns.every(c => Math.hypot(c.x - x, c.z - z) > c.r + rad + pad) && sites.every(s => Math.hypot(s.x - x, s.z - z) > s.r + rad + pad - 2) &&
    feats.every(f => Math.hypot(f.x - x, f.z - z) > f.r + rad + 4) && roads.every(([a, b]) => segDist(x, z, a.x, a.z, b.x, b.z) > rad * 0.7 + 5) && riverEdge(t.rivers, x, z) > rad + 4 && !nearRect(blocks, x, z, rad, 5);
  // 강: 지도를 가로질러 굽이칩니다. 마을과 시설 곁을 피해 갈 때까지 다시 시도합니다.
  for (let k = 0; k < (br ? 2 : 0); k++) for (let tries = 0; tries < 500; tries++) {
    const horiz = rng() < 0.5, a0 = (rng() - 0.5) * half * 1.3, a1 = a0 + (rng() - 0.5) * half * 0.9, n = 10, w = 7 + rng() * 4, ph = rng() * 6, amp = 16 + rng() * 22, raw: Array<[number, number]> = [];
    for (let i = 0; i <= n; i++) { const u = -half - 40 + (i / n) * (2 * half + 80), off = a0 + (a1 - a0) * (i / n) + Math.sin(i * 0.9 + ph) * amp; raw.push(horiz ? [u, off] : [off, u]); }
    const pts = smooth(raw, 2); let ok = true;
    for (let i = 0; i + 1 < pts.length && ok; i++) {
      const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]), m = Math.max(1, Math.ceil(len / 5));
      for (let s = 0; s < m && ok; s++) {
        const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * (s / m), z = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * (s / m), pad = w / 2 + 3;
        if (towns.some(c => Math.hypot(c.x - x, c.z - z) < c.r + pad) || sites.some(c => Math.hypot(c.x - x, c.z - z) < c.r + pad - 2)) ok = false;
        else if (nearRect(blocks, x, z, pad, 2)) ok = false;
        else if (riverEdge(t.rivers, x, z) < 50) ok = false;
      }
    }
    if (ok) { t.rivers.push({ pts, w }); break; }
  }
  // 숲
  for (let i = 0, want = br ? 8 : 2, tries = 0; i < want && tries < 300; tries++) {
    const r = (br ? 20 : 14) + rng() * (br ? 13 : 8), x = (rng() * 2 - 1) * (half - r - 6), z = (rng() * 2 - 1) * (half - r - 6);
    if (free(x, z, r, 4)) { t.forests.push({ x, z, r }); feats.push({ x, z, r }); i++; }
  }
  // 호수와 늪
  const pond = (swamp: boolean, tries: number): void => {
    for (let i = 0; i < tries; i++) {
      const rx = (br ? (swamp ? 24 : 20) + rng() * (swamp ? 12 : 16) : 9 + rng() * 5), rz = rx * (0.6 + rng() * 0.3), ry = rng() * Math.PI, rad = Math.max(rx, rz) * 1.05;
      const x = (rng() * 2 - 1) * (half - rad - 8), z = (rng() * 2 - 1) * (half - rad - 8);
      if (free(x, z, rad)) { t.ponds.push({ x, z, rx, rz, ry, swamp }); feats.push({ x, z, r: rad }); return; }
    }
  };
  for (let i = 0; i < (br ? 3 : 1); i++) pond(false, 120);
  for (let i = 0; i < (br ? 3 : 0); i++) pond(true, 120);
  // 낮은 바위 둔덕부터 높은 절벽형 언덕까지 다양한 실루엣을 섞습니다.
  // 현재 물리 시스템에서 언덕은 올라갈 수 없는 엄폐물이며, 경사 이동은 별도 작업입니다.
  for (let i = 0, want = br ? 13 : 3, tries = 0; i < want && tries < 400; tries++) {
    const tall = rng() < 0.3;
    const r = (br ? 10 : 8) + rng() * (tall ? 15 : 13);
    const x = (rng() * 2 - 1) * (half - r - 8), z = (rng() * 2 - 1) * (half - r - 8);
    const h = tall ? 8 + rng() * 5 : 2.5 + rng() * 4.5;
    if (free(x, z, r)) { t.hills.push({ x, z, r, h }); feats.push({ x, z, r }); i++; }
  }
  // 오를 수 있는 완만한 능선: 고도는 위치 함수만으로 계산하므로
  // 화면·물리·네트워크에서 동일한 값을 얻고 전용 충돌 상자가 필요하지 않습니다.
  for (let i = 0, want = br ? 10 : 3, tries = 0; i < want && tries < 440; tries++) {
    const r = (br ? 23 : 14) + rng() * (br ? 15 : 9), h = 1.7 + rng() * (br ? 2.3 : 1.5);
    const x = (rng() * 2 - 1) * (half - r - 8), z = (rng() * 2 - 1) * (half - r - 8);
    if (!free(x, z, r, 4)) continue;
    t.rises.push({ x, z, r, h }); feats.push({ x, z, r }); i++;
  }
  // 절벽: 문틈을 낸 긴 암벽
  for (let i = 0, want = br ? 6 : 1, tries = 0; i < want && tries < 300; tries++) {
    const len = (br ? 36 : 24) + rng() * (br ? 38 : 12), horiz = rng() < 0.5, x = (rng() * 2 - 1) * (half - len / 2 - 8), z = (rng() * 2 - 1) * (half - len / 2 - 8), rad = len * 0.5;
    if (!free(x, z, rad, 3)) continue;
    const h = 4.5 + rng() * 3.5, gaps = len > 50 ? 2 : 1, cuts = [0, ...Array.from({ length: gaps }, (_, g) => (g + 0.5 + (rng() - 0.5) * 0.3) / gaps), 1], gw = 6 / len;
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k] + (k > 0 ? gw / 2 : 0), b = cuts[k + 1] - (k + 2 < cuts.length ? gw / 2 : 0); if (b - a < 0.05) continue;
      const p0 = (a - 0.5) * len, p1 = (b - 0.5) * len; t.cliffs.push(horiz ? { x0: x + p0, x1: x + p1, z0: z - CLIFF_T / 2, z1: z + CLIFF_T / 2, h } : { x0: x - CLIFF_T / 2, x1: x + CLIFF_T / 2, z0: z + p0, z1: z + p1, h });
    }
    feats.push({ x, z, r: rad }); i++;
  }
  // 다리: 길이 물을 지나는 곳마다
  for (const [a, b] of roads) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), ang = Math.atan2(b.z - a.z, b.x - a.x), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len; let first = -1, last = -1;
    for (let d = 0; d <= len; d += 1.5) if (waterDepth(t, a.x + ux * d, a.z + uz * d, false)) { if (first < 0) first = d; last = d; }
    if (first >= 0) { const mid = (first + last) / 2; t.bridges.push({ x: a.x + ux * mid, z: a.z + uz * mid, ry: ang, len: last - first + 7 }); }
  }
  return t;
}
