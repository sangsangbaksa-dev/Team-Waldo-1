// ZERO ZONE — 봇 길찾기. 지도를 1m 격자로 나누고 벽·바위·나무 밑동이 닿는 칸을 막은 뒤 A* 로 길을 찾습니다.
import { PLAYER } from './config';
import type { GameMap } from './world';

export interface Nav { half: number; w: number; block: Uint8Array; g: Float32Array; from: Int32Array; mark: Uint32Array; stamp: number }
const navs = new WeakMap<GameMap, Nav>();

export function navFor(map: GameMap): Nav {
  let nav = navs.get(map); if (nav) return nav;
  const w = Math.ceil(map.half * 2), n = w * w; nav = { half: map.half, w, block: new Uint8Array(n), g: new Float32Array(n), from: new Int32Array(n), mark: new Uint32Array(n), stamp: 0 };
  const pad = PLAYER.radius + 0.1;
  for (const b of map.boxes) {
    // Vehicles are dynamic and handled by live collision checks, not this cached static grid.
    if (b.kind === 'vehicle' || b.y0 >= PLAYER.height - 0.3) continue;
    // 칸의 중심이 부풀린 상자 안에 들어올 때만 막습니다(1.5m 문틈도 항상 한 칸은 비도록).
    const x0 = Math.max(0, Math.ceil(b.x0 - pad + nav.half - 0.5)), x1 = Math.min(w - 1, Math.floor(b.x1 + pad + nav.half - 0.5)), z0 = Math.max(0, Math.ceil(b.z0 - pad + nav.half - 0.5)), z1 = Math.min(w - 1, Math.floor(b.z1 + pad + nav.half - 0.5));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) nav.block[z * w + x] = 1;
  }
  navs.set(map, nav); return nav;
}

const cellOf = (nav: Nav, v: number): number => Math.max(0, Math.min(nav.w - 1, Math.floor(v + nav.half)));
const blockedCell = (nav: Nav, x: number, z: number): boolean => nav.block[cellOf(nav, z) * nav.w + cellOf(nav, x)] === 1;

/** (ax,az)에서 (bx,bz)까지 직선으로 걸어도 막히지 않는지. */
export function walkable(nav: Nav, ax: number, az: number, bx: number, bz: number): boolean {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.5);
  for (let i = 1; i <= n; i++) { const t = i / n; if (blockedCell(nav, ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
  return true;
}

/** 목표가 막힌 칸이면 가장 가까운 빈 칸으로 옮깁니다. */
function freeCell(nav: Nav, cx: number, cz: number): number {
  const w = nav.w; if (!nav.block[cz * w + cx]) return cz * w + cx;
  for (let r = 1; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const x = cx + dx, z = cz + dz;
    if (x >= 0 && z >= 0 && x < w && z < w && !nav.block[z * w + x]) return z * w + x;
  }
  return -1;
}

const SQ2 = Math.SQRT2;
/** A* 경로(평탄화된 [x,z,x,z,…]). 길이 없으면 null. */
export function findPath(nav: Nav, sx: number, sz: number, gx: number, gz: number, maxNodes = 40000): number[] | null {
  const w = nav.w, s = freeCell(nav, cellOf(nav, sx), cellOf(nav, sz)), e = freeCell(nav, cellOf(nav, gx), cellOf(nav, gz)); if (s < 0 || e < 0) return null;
  // Two stamps per search let the existing typed array track both discovered and closed cells.
  if (nav.stamp >= 0xfffffffd) { nav.mark.fill(0); nav.stamp = 0; }
  const stamp = nav.stamp + 1, closedStamp = stamp + 1; nav.stamp = closedStamp;
  const ex = e % w, ez = (e / w) | 0, open: number[] = [];
  const push = (f: number, i: number): void => {
    let k = open.length / 2; open.push(f, i);
    while (k > 0) { const p = (k - 1) >> 1; if (open[p * 2] <= f) break; open[k * 2] = open[p * 2]; open[k * 2 + 1] = open[p * 2 + 1]; k = p; }
    open[k * 2] = f; open[k * 2 + 1] = i;
  };
  const pop = (): number => {
    const top = open[1], lastI = open.pop()!, lastF = open.pop()!, count = open.length / 2;
    if (count) {
      let k = 0;
      for (;;) { let child = 2 * k + 1; if (child >= count) break; if (child + 1 < count && open[(child + 1) * 2] < open[child * 2]) child++; if (open[child * 2] >= lastF) break; open[k * 2] = open[child * 2]; open[k * 2 + 1] = open[child * 2 + 1]; k = child; }
      open[k * 2] = lastF; open[k * 2 + 1] = lastI;
    }
    return top;
  };
  const h = (x: number, z: number): number => { const dx = Math.abs(x - ex), dz = Math.abs(z - ez); return (dx + dz) + (SQ2 - 2) * Math.min(dx, dz); };
  nav.g[s] = 0; nav.from[s] = -1; nav.mark[s] = stamp; push(h(s % w, (s / w) | 0), s);
  let found = false, nodes = 0;
  while (open.length && nodes < maxNodes) {
    const i = pop(); if (nav.mark[i] === closedStamp) continue; nav.mark[i] = closedStamp; nodes++; if (i === e) { found = true; break; }
    const x = i % w, z = (i / w) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= w || nz >= w) continue;
      const j = nz * w + nx; if (nav.block[j] || nav.mark[j] === closedStamp) continue; if (dx && dz && (nav.block[z * w + nx] || nav.block[nz * w + x])) continue; // 모서리 가로지르기 금지
      const g = nav.g[i] + (dx && dz ? SQ2 : 1); if (nav.mark[j] === stamp && g >= nav.g[j]) continue;
      nav.mark[j] = stamp; nav.g[j] = g; nav.from[j] = i; push(g + h(nx, nz), j);
    }
  }
  if (!found) return null;
  const cells: number[] = []; for (let i = e; i >= 0; i = nav.from[i]) cells.push(i); cells.reverse();
  const pts = cells.map(i => [(i % w) - nav.half + 0.5, ((i / w) | 0) - nav.half + 0.5] as const);
  // 직선으로 갈 수 있는 한 멀리 건너뛰어 꺾이는 점만 남깁니다.
  const out: number[] = []; let a = 0;
  while (a < pts.length - 1) {
    let b = a + 1; while (b + 1 < pts.length && walkable(nav, pts[a][0], pts[a][1], pts[b + 1][0], pts[b + 1][1])) b++;
    out.push(pts[b][0], pts[b][1]); a = b;
  }
  return out;
}
