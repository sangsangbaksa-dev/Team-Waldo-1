// LAST CITY — 도시 생성, 충돌 격자, 길찾기
import { BLOCK, BLOCKS, NAV, NAVN, PITCH, ROAD, SIZE, type BizKind } from './defs';

export type Rng = () => number;
export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface Solid { x: number; y: number; w: number; h: number; height: number; wall: string; roof: string; struct: number; alive: boolean; sign?: string; signColor?: string }
export type BlockType = 'base' | 'plaza' | 'city' | 'park' | 'lot' | 'police' | 'military';
export interface Block { i: number; j: number; x: number; y: number; type: BlockType }
export interface BizSite { kind: BizKind; x: number; y: number; solid: number }
export interface CityMap {
  solids: Solid[]; grid: number[][]; nav: Uint8Array; blocks: Block[]; bases: { x: number; y: number; bx: number; by: number }[];
  biz: BizSite[]; crystals: { x: number; y: number; amount: number }[]; loot: { x: number; y: number; tier: number }[];
  cars: { x: number; y: number; ang: number; kind: string }[]; trees: { x: number; y: number; r: number }[]; police: { x: number; y: number };
}
const GC = 160, GN = Math.ceil(SIZE / GC);
const WALLS = ['#59606e', '#6b5a52', '#4f6470', '#6d6654', '#5b5470', '#48606a', '#70585e', '#5a6b5c'];
const ROOFS = ['#8a93a3', '#a38a7d', '#7c9aab', '#a89f82', '#8d83ab', '#7096a3', '#ab868f', '#8ba58e'];
export const BASE_BLOCKS: [number, number][] = [[1, 1], [4, 1], [7, 1], [1, 4], [7, 4], [1, 7], [4, 7], [7, 7]];
const TEMPLATES: number[][][] = [
  [[80, 80, 280, 280]],
  [[40, 40, 140, 140], [260, 40, 140, 140], [40, 260, 140, 140], [260, 260, 140, 140]],
  [[40, 40, 360, 140], [40, 260, 360, 140]],
  [[40, 40, 140, 360], [260, 40, 140, 360]],
  [[40, 40, 360, 140], [40, 260, 140, 140], [260, 260, 140, 140]],
  [[40, 40, 140, 360], [260, 40, 140, 140], [260, 260, 140, 140]],
  [[40, 40, 220, 140], [340, 40, 60, 140], [40, 260, 140, 140], [260, 260, 140, 140]],
];

export function addSolid(map: CityMap, s: Solid): number {
  const idx = map.solids.push(s) - 1;
  for (let gy = Math.floor(s.y / GC); gy <= Math.floor((s.y + s.h) / GC); gy++) for (let gx = Math.floor(s.x / GC); gx <= Math.floor((s.x + s.w) / GC); gx++) map.grid[gy * GN + gx]?.push(idx);
  markNav(map, s, 1);
  return idx;
}
export function removeSolid(map: CityMap, idx: number): void {
  const s = map.solids[idx]; if (!s || !s.alive) return;
  s.alive = false; markNav(map, s, -1);
  for (let gy = Math.floor(s.y / GC); gy <= Math.floor((s.y + s.h) / GC); gy++) for (let gx = Math.floor(s.x / GC); gx <= Math.floor((s.x + s.w) / GC); gx++) {
    const cell = map.grid[gy * GN + gx]; if (!cell) continue; const at = cell.indexOf(idx); if (at >= 0) cell.splice(at, 1);
  }
}
function markNav(map: CityMap, s: Solid, d: number): void {
  const pad = 8;
  for (let cy = Math.max(0, Math.floor((s.y - pad) / NAV)); cy <= Math.min(NAVN - 1, Math.floor((s.y + s.h + pad) / NAV)); cy++)
    for (let cx = Math.max(0, Math.floor((s.x - pad) / NAV)); cx <= Math.min(NAVN - 1, Math.floor((s.x + s.w + pad) / NAV)); cx++) {
      const px = cx * NAV + NAV / 2, py = cy * NAV + NAV / 2;
      if (px > s.x - pad && px < s.x + s.w + pad && py > s.y - pad && py < s.y + s.h + pad) map.nav[cy * NAVN + cx] += d;
    }
}
export function solidAt(map: CityMap, x: number, y: number): Solid | null {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  const cell = map.grid[Math.floor(y / GC) * GN + Math.floor(x / GC)];
  for (let k = 0; k < cell.length; k++) { const s = map.solids[cell[k]]; if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s; }
  return null;
}
/** 1인칭 카메라 전용 여유 거리: 몸(충돌 반경 13)보다 벽에서 더 떨어진 위치로 눈을 밀어냅니다. 벽에 붙어도 시야가 벽면으로만 가득 차지 않게 합니다. */
export const FP_CAM_CLEARANCE = 24;
export function fpCameraSpot(map: CityMap, x: number, y: number, r = FP_CAM_CLEARANCE): { x: number; y: number } {
  const o = { x, y }; resolveCircle(map, o, r); return o;
}
/** 원을 고정 지형 밖으로 밀어냅니다. 충돌했으면 true. */
export function resolveCircle(map: CityMap, o: { x: number; y: number }, r: number): boolean {
  let hit = false;
  const gx0 = Math.max(0, Math.floor((o.x - r) / GC)), gx1 = Math.min(GN - 1, Math.floor((o.x + r) / GC)), gy0 = Math.max(0, Math.floor((o.y - r) / GC)), gy1 = Math.min(GN - 1, Math.floor((o.y + r) / GC));
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const cell = map.grid[gy * GN + gx];
    for (let k = 0; k < cell.length; k++) {
      const s = map.solids[cell[k]];
      const nx = Math.max(s.x, Math.min(o.x, s.x + s.w)), ny = Math.max(s.y, Math.min(o.y, s.y + s.h));
      let dx = o.x - nx, dy = o.y - ny; const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.0001) { const d = Math.sqrt(d2); dx /= d; dy /= d; o.x = nx + dx * r; o.y = ny + dy * r; }
      else { // 내부에 완전히 들어온 경우: 가장 가까운 변으로
        const l = o.x - s.x, rr = s.x + s.w - o.x, t = o.y - s.y, b = s.y + s.h - o.y, m = Math.min(l, rr, t, b);
        if (m === l) o.x = s.x - r; else if (m === rr) o.x = s.x + s.w + r; else if (m === t) o.y = s.y - r; else o.y = s.y + s.h + r;
      }
    }
  }
  if (o.x < r) { o.x = r; hit = true; } if (o.y < r) { o.y = r; hit = true; }
  if (o.x > SIZE - r) { o.x = SIZE - r; hit = true; } if (o.y > SIZE - r) { o.y = SIZE - r; hit = true; }
  return hit;
}
export function navBlocked(map: CityMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return true;
  return map.nav[Math.floor(y / NAV) * NAVN + Math.floor(x / NAV)] > 0;
}
/** 두 지점 사이가 건물에 막히지 않았는지 (시야·직선 이동). */
export function clearLine(map: CityMap, x0: number, y0: number, x1: number, y1: number, exact = false): boolean {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(d / 18));
  for (let k = 1; k < n; k++) {
    const x = x0 + dx * k / n, y = y0 + dy * k / n;
    if (exact ? solidAt(map, x, y) !== null : navBlocked(map, x, y)) return false;
  }
  return true;
}
export const onRoad = (v: number): boolean => ((v % PITCH) + PITCH) % PITCH < ROAD;
export function rectFree(map: CityMap, x: number, y: number, w: number, h: number): boolean {
  if (x < 20 || y < 20 || x + w > SIZE - 20 || y + h > SIZE - 20) return false;
  for (const s of map.solids) if (s.alive && x < s.x + s.w + 14 && x + w > s.x - 14 && y < s.y + s.h + 14 && y + h > s.y - 14) return false;
  // 도로 침범 금지 (보도는 허용)
  for (let px = x; px <= x + w; px += Math.min(w, 20)) if (onRoad(px)) return false;
  for (let py = y; py <= y + h; py += Math.min(h, 20)) if (onRoad(py)) return false;
  return true;
}

// ---------- A* ----------
const gScore = new Float32Array(NAVN * NAVN), came = new Int32Array(NAVN * NAVN), stamp = new Uint32Array(NAVN * NAVN), closed = new Uint32Array(NAVN * NAVN);
let stampId = 0; const heap: number[] = [], heapF: number[] = [];
function push(n: number, f: number): void {
  let i = heap.length; heap.push(n); heapF.push(f);
  while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heap[i] = heap[p]; heapF[i] = heapF[p]; i = p; }
  heap[i] = n; heapF[i] = f;
}
function pop(): number {
  const top = heap[0], n = heap.pop()!, f = heapF.pop()!;
  if (heap.length) {
    let i = 0; const len = heap.length;
    for (;;) { let c = i * 2 + 1; if (c >= len) break; if (c + 1 < len && heapF[c + 1] < heapF[c]) c++; if (heapF[c] >= f) break; heap[i] = heap[c]; heapF[i] = heapF[c]; i = c; }
    heap[i] = n; heapF[i] = f;
  }
  return top;
}
function nearestFree(map: CityMap, cx: number, cy: number): number {
  cx = Math.max(0, Math.min(NAVN - 1, cx)); cy = Math.max(0, Math.min(NAVN - 1, cy));
  if (!map.nav[cy * NAVN + cx]) return cy * NAVN + cx;
  for (let r = 1; r <= 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= NAVN || y >= NAVN) continue;
    if (!map.nav[y * NAVN + x]) return y * NAVN + x;
  }
  return -1;
}
export function findPath(map: CityMap, x0: number, y0: number, x1: number, y1: number): number[] | null {
  const start = nearestFree(map, Math.floor(x0 / NAV), Math.floor(y0 / NAV)), goal = nearestFree(map, Math.floor(x1 / NAV), Math.floor(y1 / NAV));
  if (start < 0 || goal < 0) return null;
  stampId++; heap.length = 0; heapF.length = 0;
  const gx = goal % NAVN, gy = (goal / NAVN) | 0;
  gScore[start] = 0; came[start] = -1; stamp[start] = stampId; push(start, 0);
  let found = false, expanded = 0;
  while (heap.length && expanded < 9000) {
    const cur = pop(); if (closed[cur] === stampId) continue; closed[cur] = stampId; expanded++;
    if (cur === goal) { found = true; break; }
    const cx = cur % NAVN, cy = (cur / NAVN) | 0, g = gScore[cur];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NAVN || ny >= NAVN) continue;
      const n = ny * NAVN + nx; if (map.nav[n] || closed[n] === stampId) continue;
      if (dx && dy && (map.nav[cy * NAVN + nx] || map.nav[ny * NAVN + cx])) continue;
      const ng = g + (dx && dy ? 1.414 : 1);
      if (stamp[n] === stampId && gScore[n] <= ng) continue;
      gScore[n] = ng; came[n] = cur; stamp[n] = stampId;
      const hx = Math.abs(nx - gx), hy = Math.abs(ny - gy);
      push(n, ng + (hx + hy - 0.586 * Math.min(hx, hy)) * 1.05);
    }
  }
  if (!found) return null;
  const cells: number[] = []; for (let c = goal; c >= 0; c = came[c]) cells.push(c); cells.reverse();
  // 직선으로 볼 수 있는 구간은 건너뛰어 부드럽게
  const out: number[] = []; let ax = x0, ay = y0, i = 0;
  while (i < cells.length - 1) {
    let j = Math.min(cells.length - 1, i + 12);
    for (; j > i + 1; j--) { const c = cells[j]; if (clearLine(map, ax, ay, (c % NAVN) * NAV + 20, ((c / NAVN) | 0) * NAV + 20)) break; }
    const c = cells[j]; ax = (c % NAVN) * NAV + 20; ay = ((c / NAVN) | 0) * NAV + 20; out.push(ax, ay); i = j;
  }
  if (!navBlocked(map, x1, y1)) out.push(x1, y1);
  return out;
}

// ---------- 생성 ----------
export function generateCity(rng: Rng): CityMap {
  const map: CityMap = { solids: [], grid: Array.from({ length: GN * GN }, () => []), nav: new Uint8Array(NAVN * NAVN), blocks: [], bases: [], biz: [], crystals: [], loot: [], cars: [], trees: [], police: { x: 0, y: 0 } };
  const pick = <T>(a: T[]): T => a[Math.floor(rng() * a.length)];
  const types = new Map<string, BlockType>();
  for (const [i, j] of BASE_BLOCKS) types.set(`${i},${j}`, 'base');
  types.set('4,4', 'plaza');
  const free: [number, number][] = [];
  for (let j = 0; j < BLOCKS; j++) for (let i = 0; i < BLOCKS; i++) if (!types.has(`${i},${j}`)) free.push([i, j]);
  for (let k = free.length - 1; k > 0; k--) { const m = Math.floor(rng() * (k + 1)); [free[k], free[m]] = [free[m], free[k]]; }
  const special: BlockType[] = ['police', 'military', 'park', 'park', 'park', 'park', 'park', 'park', 'lot', 'lot', 'lot', 'lot'];
  const gunshops = new Set<string>();
  for (const [i, j] of free) {
    const central = Math.max(Math.abs(i - 4), Math.abs(j - 4)) <= 1;
    if (special.length && !central) types.set(`${i},${j}`, special.shift()!);
    else if (gunshops.size < 4 && !central && rng() < 0.3) gunshops.add(`${i},${j}`);
  }
  const building = (x: number, y: number, w: number, h: number, height: number, sign?: string, signColor?: string): number => {
    const c = Math.floor(rng() * WALLS.length);
    return addSolid(map, { x, y, w, h, height, wall: WALLS[c], roof: ROOFS[c], struct: 0, alive: true, sign, signColor });
  };
  const padFor = (x0: number, y0: number, b: number[]): { x: number; y: number } => {
    const d = [b[0], b[1], BLOCK - b[0] - b[2], BLOCK - b[1] - b[3]], m = Math.min(...d), side = d.indexOf(m);
    if (side === 0) return { x: x0 + b[0] - 20, y: y0 + b[1] + b[3] / 2 };
    if (side === 1) return { x: x0 + b[0] + b[2] / 2, y: y0 + b[1] - 20 };
    if (side === 2) return { x: x0 + b[0] + b[2] + 20, y: y0 + b[1] + b[3] / 2 };
    return { x: x0 + b[0] + b[2] / 2, y: y0 + b[1] + b[3] + 20 };
  };
  for (let j = 0; j < BLOCKS; j++) for (let i = 0; i < BLOCKS; i++) {
    const x0 = ROAD + i * PITCH, y0 = ROAD + j * PITCH, key = `${i},${j}`, type = types.get(key) ?? 'city';
    map.blocks.push({ i, j, x: x0, y: y0, type });
    const ring = Math.max(Math.abs(i - 4), Math.abs(j - 4));
    if (type === 'base') {
      map.bases.push({ x: x0 + BLOCK / 2, y: y0 + BLOCK / 2, bx: x0, by: y0 });
      for (const [cx, cy] of [[70, 70], [370, 370]]) for (let k = 0; k < 6; k++) map.crystals.push({ x: x0 + cx + Math.cos(k * 1.05) * 34 + (k % 2) * 8, y: y0 + cy + Math.sin(k * 1.05) * 34, amount: 1400 });
    } else if (type === 'plaza') {
      const s = building(x0 + 140, y0 + 120, 160, 160, 0.42, 'BANK', '#e8f1ff');
      map.biz.push({ kind: 'bank', x: x0 + 220, y: y0 + 302, solid: s });
      for (const [tx, ty] of [[60, 60], [380, 60], [60, 380], [380, 380]]) map.trees.push({ x: x0 + tx, y: y0 + ty, r: 26 });
      map.loot.push({ x: x0 + 220, y: y0 + 70, tier: 3 }, { x: x0 + 70, y: y0 + 220, tier: 2 }, { x: x0 + 370, y: y0 + 220, tier: 2 });
    } else if (type === 'park') {
      for (let k = 0; k < 9; k++) map.trees.push({ x: x0 + 40 + rng() * 360, y: y0 + 40 + rng() * 360, r: 18 + rng() * 16 });
      for (let k = 0; k < 6; k++) map.crystals.push({ x: x0 + 220 + Math.cos(k * 1.05) * 40, y: y0 + 220 + Math.sin(k * 1.05) * 40, amount: 2600 });
      map.loot.push({ x: x0 + 90 + rng() * 80, y: y0 + 300 + rng() * 60, tier: 1 });
    } else if (type === 'lot') {
      building(x0 + 40, y0 + 40, 100, 80, 0.08);
      for (let k = 0; k < 5; k++) if (rng() < 0.8) map.cars.push({ x: x0 + 90 + k * 68, y: y0 + 330, ang: -Math.PI / 2, kind: rng() < 0.2 ? 'sports' : rng() < 0.3 ? 'truck' : 'sedan' });
      map.loot.push({ x: x0 + 300, y: y0 + 120, tier: 1 });
    } else if (type === 'police') {
      building(x0 + 80, y0 + 60, 280, 160, 0.2, 'POLICE', '#9db8ff');
      map.police = { x: x0 + 220, y: y0 + 300 };
      for (let k = 0; k < 3; k++) map.cars.push({ x: x0 + 120 + k * 100, y: y0 + 340, ang: -Math.PI / 2, kind: 'police' });
    } else if (type === 'military') {
      building(x0 + 40, y0 + 40, 200, 120, 0.14, 'ARMY', '#b6c48a');
      building(x0 + 300, y0 + 40, 100, 100, 0.1);
      map.cars.push({ x: x0 + 320, y: y0 + 320, ang: 0, kind: 'tank' });
      map.loot.push({ x: x0 + 100, y: y0 + 240, tier: 3 }, { x: x0 + 180, y: y0 + 330, tier: 2 }, { x: x0 + 260, y: y0 + 200, tier: 2 });
    } else {
      const tpl = pick(TEMPLATES); let bizCount = 0; const gun = gunshops.has(key);
      const order = tpl.map((_, k) => k).sort(() => rng() - 0.5);
      for (const k of order) {
        const b = tpl[k]; let kind: BizKind | null = null;
        if (gun && bizCount === 0) kind = 'gunshop';
        else if (bizCount === 0 || (bizCount === 1 && rng() < 0.3)) {
          const r = rng();
          kind = ring <= 1 ? (r < 0.45 ? 'casino' : r < 0.8 ? 'club' : 'store') : ring === 2 ? (r < 0.3 ? 'club' : r < 0.55 ? 'plant' : 'store') : (r < 0.65 ? 'store' : 'plant');
        }
        const signs: Record<string, [string, string]> = { store: ['24', '#5fd38a'], club: ['CLUB', '#ff6ad5'], plant: ['FAB', '#7fd8ff'], casino: ['777', '#ffd84a'], gunshop: ['GUNS', '#ff5d5d'] };
        const s = building(x0 + b[0], y0 + b[1], b[2], b[3], 0.1 + rng() * (ring <= 2 ? 0.34 : 0.2), kind ? signs[kind][0] : undefined, kind ? signs[kind][1] : undefined);
        if (kind) { const p = padFor(x0, y0, b); map.biz.push({ kind, x: p.x, y: p.y, solid: s }); bizCount++; }
      }
      if (rng() < 0.7) map.loot.push({ x: x0 + 220 + (rng() - 0.5) * 30, y: y0 + 220 + (rng() - 0.5) * 30, tier: rng() < 0.25 ? 2 : 1 });
      if (rng() < 0.35) map.loot.push({ x: x0 + 18, y: y0 + 60 + rng() * 320, tier: 1 });
    }
  }
  return map;
}
/** 무작위 차로 위치 (도로 중심에서 우측 차선). dir: 0 동, 1 남, 2 서, 3 북 */
export function lanePoint(rng: Rng): { x: number; y: number; dir: number } {
  const k = Math.floor(rng() * (BLOCKS + 1)), along = ROAD + rng() * (SIZE - ROAD * 2), c = k * PITCH + ROAD / 2;
  if (rng() < 0.5) { const east = rng() < 0.5; return { x: along, y: c + (east ? 30 : -30), dir: east ? 0 : 2 }; }
  const south = rng() < 0.5; return { x: c + (south ? -30 : 30), y: along, dir: south ? 1 : 3 };
}
