// ZERO ZONE — 봇 길찾기. 지도를 1m 격자로 나누고 땅 위를 걷는 사람을 막는 벽·바위·나무 밑동이 닿는 칸을 막은 뒤 A* 로 길을 찾습니다.
// 계단 칸은 막지 않습니다(봇이 걸어서 오릅니다). 위층 바닥판·난간·지붕처럼 높이 떠 있는 것은 땅 위 사람을 막지 않으므로 무시합니다.
import { PLAYER } from './config';
import { STEP_UP, groundAt, type GameMap } from './world';

export interface Nav { half: number; w: number; block: Uint8Array; g: Float32Array; from: Int32Array; mark: Uint32Array; shut: Uint32Array; stamp: number }
const navs = new WeakMap<GameMap, Nav>();

export function navFor(map: GameMap): Nav {
  let nav = navs.get(map); if (nav) return nav;
  const w = Math.ceil(map.half * 2), n = w * w;
  nav = { half: map.half, w, block: new Uint8Array(n), g: new Float32Array(n), from: new Int32Array(n), mark: new Uint32Array(n), shut: new Uint32Array(n), stamp: 0 };
  const pad = PLAYER.radius + 0.1;
  for (const b of map.boxes) {
    if (b.kind === 'step') continue;
    const base = groundAt(map.terrain, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    if (b.y1 <= base + STEP_UP + 0.05 || b.y0 >= base + PLAYER.height - 0.3) continue;
    // 칸의 중심이 부풀린 상자 안에 들어올 때만 막습니다(1.6m 문틈도 항상 한 칸은 비도록).
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
  for (let r = 1; r < 10; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const x = cx + dx, z = cz + dz;
    if (x >= 0 && z >= 0 && x < w && z < w && !nav.block[z * w + x]) return z * w + x;
  }
  return -1;
}

const SQ2 = Math.SQRT2;
/** A* 경로(평탄화된 [x,z,x,z,…]). 길이 없으면 null. 넓은 지도에서는 가까운 목표(수십 m)에 쓰고, 먼 곳은 중간 지점을 이어 갑니다. */
export function findPath(nav: Nav, sx: number, sz: number, gx: number, gz: number, maxNodes = 24000): number[] | null {
  const w = nav.w, s = freeCell(nav, cellOf(nav, sx), cellOf(nav, sz)), e = freeCell(nav, cellOf(nav, gx), cellOf(nav, gz)); if (s < 0 || e < 0) return null;
  const stamp = ++nav.stamp, ex = e % w, ez = (e / w) | 0, heap: number[] = [];
  const push = (f: number, i: number): void => {
    heap.push(f, i); let k = heap.length / 2 - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p * 2] <= heap[k * 2]) break; const tf = heap[p * 2], ti = heap[p * 2 + 1]; heap[p * 2] = heap[k * 2]; heap[p * 2 + 1] = heap[k * 2 + 1]; heap[k * 2] = tf; heap[k * 2 + 1] = ti; k = p; }
  };
  const pop = (): number => {
    const top = heap[1], lf = heap[heap.length - 2], li = heap[heap.length - 1]; heap.length -= 2; const m = heap.length / 2;
    if (m > 0) { heap[0] = lf; heap[1] = li; let k = 0; for (;;) { const a = k * 2 + 1, b = a + 1; let q = k; if (a < m && heap[a * 2] < heap[q * 2]) q = a; if (b < m && heap[b * 2] < heap[q * 2]) q = b; if (q === k) break; const tf = heap[q * 2], ti = heap[q * 2 + 1]; heap[q * 2] = heap[k * 2]; heap[q * 2 + 1] = heap[k * 2 + 1]; heap[k * 2] = tf; heap[k * 2 + 1] = ti; k = q; } }
    return top;
  };
  const h = (x: number, z: number): number => { const dx = Math.abs(x - ex), dz = Math.abs(z - ez); return (dx + dz) + (SQ2 - 2) * Math.min(dx, dz); };
  nav.g[s] = 0; nav.from[s] = -1; nav.mark[s] = stamp; push(h(s % w, (s / w) | 0), s);
  let found = false, nodes = 0;
  while (heap.length && nodes++ < maxNodes) {
    const i = pop(); if (nav.shut[i] === stamp) continue; nav.shut[i] = stamp; if (i === e) { found = true; break; }
    const x = i % w, z = (i / w) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= w || nz >= w) continue;
      const j = nz * w + nx; if (nav.block[j] || nav.shut[j] === stamp) continue; if (dx && dz && (nav.block[z * w + nx] || nav.block[nz * w + x])) continue; // 모서리 가로지르기 금지
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
