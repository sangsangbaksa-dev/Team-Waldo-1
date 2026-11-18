// ZERO ZONE — 지도 생성(지형·강·호수·마을·건물·숲·바위·전리품)과 충돌·광선 검사. 화면과 무관한 순수 로직이라 시드가 같으면 어디서나 같은 지도가 나옵니다.
// 지형 높이는 + - * / 와 난수 격자만으로 계산합니다(1대1 두 브라우저가 같은 땅을 보도록 삼각함수를 쓰지 않습니다).
import { BR_FILL, MAP_HALF, PLAYER, WEAPON_IDS, makeRng, type Mode, type WeaponId } from './config';
import { PART_IDS, type PartId, type Loadout } from './attachments';

/** 위에서 본 직사각형 + 높이 범위(절대 높이). 벽·바닥판·계단·바위·상자·나무 기둥 모두 이 모양입니다. */
export type BoxKind = 'wall' | 'rock' | 'crate' | 'trunk' | 'step' | 'slab' | 'roof' | 'rail' | 'post' | 'container' | 'hay' | 'sandbag';
export interface Box { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; kind: BoxKind; tex: number }
export type BuildingKind = 'house' | 'villa' | 'warehouse' | 'barn' | 'tower' | 'shed' | 'ruin' | 'barracks';
/** 계단: 아래 입구와 위 출구(봇이 위층으로 오르내릴 때 씁니다). */
export interface Stair { bx: number; bz: number; tx: number; tz: number; top: number }
export interface Building {
  kind: BuildingKind; x: number; z: number; w: number; d: number;
  /** 1층 바닥 높이 */ g: number; /** 벽 꼭대기 높이(바닥 기준) */ h: number; floors: number;
  tex: number; door: 'x' | 'z'; roof: 'flat' | 'gable' | 'none'; stairs: Stair | null;
  /** 창틀 장식(화면용): [x, y, z, 축(0=x,1=z), 너비, 높이] */ windows: number[];
}
export type LootKind = 'weapon' | 'ammo' | 'medkit' | 'armor' | 'helmet' | 'attachment';
/** mag·reserve: 떨어뜨린 무기가 남은 탄을 그대로 간직합니다(없으면 새 총). */
export interface Loot { id: number; kind: LootKind; weapon: WeaponId | null; x: number; z: number; y: number; taken: boolean; b: number; mag?: number; reserve?: number; part?: PartId; parts?: Loadout }
export interface Tree { x: number; z: number; y: number; s: number; pine: boolean }
export interface Rock { x: number; z: number; y: number; sx: number; sy: number; sz: number; ry: number }
export interface Bush { x: number; z: number; y: number; s: number }
export type TownKind = 'city' | 'village' | 'military' | 'farm' | 'ruins';
export interface Compound { x: number; z: number; r: number; g: number; kind: TownKind; name: string }
/** 높이 격자(STEP 미터 간격). water 보다 낮은 땅은 물에 잠깁니다. */
export interface Terrain { n: number; step: number; origin: number; h: Float32Array; water: number; max: number }

export interface GameMap {
  seed: number; mode: Mode; half: number; terrain: Terrain;
  boxes: Box[]; buildings: Building[]; trees: Tree[]; rocks: Rock[]; bushes: Bush[]; compounds: Compound[];
  /** 마을을 잇는 길(선분 [ax, az, bx, bz]) */ roads: number[][];
  loot: Loot[]; spawns: { x: number; z: number }[];
  /** 충돌·광선 검사용 격자. 칸 크기 CELL 미터. */
  grid: Map<number, number[]>;
}
export const CELL = 16;
/** 걸어서 올라설 수 있는 턱 높이(계단 한 칸보다 조금 높게) */
export const STEP_UP = 0.5;
const key = (cx: number, cz: number): number => (cx + 512) * 1024 + (cz + 512);
const cellOf = (v: number): number => Math.floor(v / CELL);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a: number, b: number, v: number): number => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function addBox(map: GameMap, b: Box): void {
  if (b.x1 - b.x0 < 0.02 || b.z1 - b.z0 < 0.02 || b.y1 - b.y0 < 0.02) return;
  const i = map.boxes.length; map.boxes.push(b);
  for (let cx = cellOf(b.x0); cx <= cellOf(b.x1); cx++) for (let cz = cellOf(b.z0); cz <= cellOf(b.z1); cz++) { const k = key(cx, cz); const l = map.grid.get(k); if (l) l.push(i); else map.grid.set(k, [i]); }
}

// ---------- 지형 ----------
/** 0~1 값 잡음: 256칸 난수 격자를 부드럽게 보간합니다(덧셈·곱셈만 사용). */
function lattice(rng: () => number): Float32Array { const g = new Float32Array(256 * 256); for (let i = 0; i < g.length; i++) g[i] = rng(); return g; }
function vnoise(g: Float32Array, x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const at = (a: number, b: number): number => g[((b & 255) << 8) | (a & 255)];
  const a0 = at(xi, zi) + (at(xi + 1, zi) - at(xi, zi)) * sx, a1 = at(xi, zi + 1) + (at(xi + 1, zi + 1) - at(xi, zi + 1)) * sx;
  return a0 + (a1 - a0) * sz;
}
export const WATER_LEVEL = 4;
const TSTEP = 2;

function makeTerrain(seed: number, mode: Mode, half: number): Terrain {
  const rng = makeRng(seed ^ 0x51ed270b), l1 = lattice(rng), l2 = lattice(rng), l3 = lattice(rng), l4 = lattice(rng), l5 = lattice(rng);
  const br = mode === 'br', amp = br ? 1 : 0.42, pad = br ? 150 : 90, extent = half + pad, n = Math.ceil((extent * 2) / TSTEP) + 1, origin = -extent;
  const h = new Float32Array(n * n), W = WATER_LEVEL;
  // 강: 지도를 비스듬히 가로지르는 한 줄기(1대1 지도에는 작은 개울).
  const rdx = rng() * 2 - 1, rdz = rng() * 2 - 1 + 0.3, rl = Math.sqrt(rdx * rdx + rdz * rdz) || 1, ca = rdx / rl, sa = rdz / rl;
  const rOff = (rng() - 0.5) * half * 0.5, rWidth = br ? 13 : 5;
  let max = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = origin + i * TSTEP, z = origin + j * TSTEP;
    const big = vnoise(l1, x / 240 + 50, z / 240 + 50), mid = vnoise(l2, x / 92 + 50, z / 92 + 50), small = vnoise(l3, x / 31 + 50, z / 31 + 50);
    const rr = 1 - Math.abs(vnoise(l4, x / 150 + 50, z / 150 + 50) * 2 - 1), ridge = rr * rr * rr;
    let y = 9 + ((big - 0.5) * 30 + (mid - 0.5) * 11 + (small - 0.5) * 2.6 + ridge * 10) * amp;
    // 지도 바깥 산맥: 가장자리로 갈수록 솟아 자연스러운 경계가 됩니다.
    const edge = smooth(half * 0.9, half + pad * 0.55, Math.max(Math.abs(x), Math.abs(z)));
    y += edge * (br ? 46 : 22) * (0.65 + ridge * 0.7 + (mid - 0.5) * 0.6);
    // 강바닥 파기
    const u = x * ca + z * sa, v = -x * sa + z * ca, center = rOff + (vnoise(l5, u / 170 + 50, 7.5) - 0.5) * (br ? 150 : 50), d = Math.abs(v - center);
    const cut = smooth(rWidth * 3.8, rWidth * 0.7, d) * (1 - edge);
    y += (W - 1.45 - y) * cut;
    // 낮은 곳은 얕은 호수: 물 깊이는 최대 1.45m(눈높이가 물 위에 남도록)
    if (y < W - 1.45) y = W - 1.45 + (y - (W - 1.45)) * 0.08;
    h[j * n + i] = y; if (y > max) max = y;
  }
  return { n, step: TSTEP, origin, h, water: W, max };
}

/** 지형 높이(바닥판·건물은 빼고). */
export function groundAt(t: Terrain, x: number, z: number): number {
  const fx = clamp((x - t.origin) / t.step, 0, t.n - 1.001), fz = clamp((z - t.origin) / t.step, 0, t.n - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, n = t.n, h = t.h;
  const a = h[j * n + i] + (h[j * n + i + 1] - h[j * n + i]) * u, b = h[(j + 1) * n + i] + (h[(j + 1) * n + i + 1] - h[(j + 1) * n + i]) * u;
  return a + (b - a) * v;
}
/** 렌더용 이전 이름(높이만 필요할 때). */
export function terrainHeight(map: GameMap, x: number, z: number): number { return groundAt(map.terrain, x, z); }

/** 원 안쪽 땅을 높이 g 로 고르고 바깥으로 갈수록 원래 땅과 이어 줍니다. */
function flatten(t: Terrain, cx: number, cz: number, r: number, blend: number, g: number): void {
  const i0 = Math.max(0, Math.floor((cx - r - blend - t.origin) / t.step)), i1 = Math.min(t.n - 1, Math.ceil((cx + r + blend - t.origin) / t.step));
  const j0 = Math.max(0, Math.floor((cz - r - blend - t.origin) / t.step)), j1 = Math.min(t.n - 1, Math.ceil((cz + r + blend - t.origin) / t.step));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = t.origin + i * t.step, z = t.origin + j * t.step, d = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2), k = smooth(r + blend, r, d);
    if (k > 0) t.h[j * t.n + i] += (g - t.h[j * t.n + i]) * k;
  }
}
/** 길이 물을 지나는 곳은 둑처럼 돋워 걸어서 건널 수 있게 합니다. */
function causeway(t: Terrain, ax: number, az: number, bx: number, bz: number, w: number): void {
  const len = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2) || 1, ux = (bx - ax) / len, uz = (bz - az) / len, lift = t.water + 0.35;
  const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - w * 2 - t.origin) / t.step)), i1 = Math.min(t.n - 1, Math.ceil((Math.max(ax, bx) + w * 2 - t.origin) / t.step));
  const j0 = Math.max(0, Math.floor((Math.min(az, bz) - w * 2 - t.origin) / t.step)), j1 = Math.min(t.n - 1, Math.ceil((Math.max(az, bz) + w * 2 - t.origin) / t.step));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = t.origin + i * t.step, z = t.origin + j * t.step, s = clamp((x - ax) * ux + (z - az) * uz, 0, len), px = ax + ux * s - x, pz = az + uz * s - z, d = Math.sqrt(px * px + pz * pz);
    const k = smooth(w * 2, w, d), c = j * t.n + i; if (k > 0 && t.h[c] < lift) t.h[c] += (lift - t.h[c]) * k;
  }
}

// ---------- 건물 ----------
const WALL_T = 0.3, FLOOR_H = 3.3, SLAB = 0.25, DOOR_W = 1.6, DOOR_H = 2.3, WIN_W = 1.3, WIN_Y0 = 1.0, WIN_Y1 = 2.2;
interface Opening { at: number; w: number; gaps: Array<[number, number]> }

/** 한 변을 세웁니다. along 은 변이 뻗는 축, c 는 그 변의 위치, base 는 바닥 높이, H 는 벽 높이. openings 의 gaps 는 바닥 기준 [아래, 위]. */
function wallSide(map: GameMap, b: Building, along: 'x' | 'z', c: number, from: number, to: number, base: number, H: number, openings: Opening[]): void {
  const mk = (a: number, e: number, y0: number, y1: number): void => {
    if (e - a < 0.04 || y1 - y0 < 0.04) return;
    addBox(map, along === 'x' ? { x0: a, x1: e, z0: c - WALL_T / 2, z1: c + WALL_T / 2, y0: base + y0, y1: base + y1, kind: 'wall', tex: b.tex } : { x0: c - WALL_T / 2, x1: c + WALL_T / 2, z0: a, z1: e, y0: base + y0, y1: base + y1, kind: 'wall', tex: b.tex });
  };
  let cur = from;
  for (const o of [...openings].sort((p, q) => p.at - q.at)) {
    const a = Math.max(cur, o.at - o.w / 2), e = Math.min(to, o.at + o.w / 2); if (e <= a) continue;
    mk(cur, a, 0, H);
    let y = 0; for (const [g0, g1] of [...o.gaps].sort((p, q) => p[0] - q[0])) { mk(a, e, y, Math.min(H, g0)); y = Math.max(y, g1);
      if (g0 > 0.5) b.windows.push(along === 'x' ? (a + e) / 2 : c, base + (g0 + g1) / 2, along === 'x' ? c : (a + e) / 2, along === 'x' ? 0 : 1, e - a, g1 - g0); }
    mk(a, e, y, H); cur = e;
  }
  mk(cur, to, 0, H);
}

/** 변 길이 L 에 창 자리를 고르게 냅니다(문 자리 doorAt 근처는 비움). */
function windowSpots(L: number, center: number, doorAt: number | null, every: number): number[] {
  const out: number[] = [], k = Math.max(0, Math.floor((L - 2.2) / every));
  for (let i = 0; i < k; i++) { const at = center - ((k - 1) * every) / 2 + i * every; if (doorAt === null || Math.abs(at - doorAt) > (DOOR_W + WIN_W) / 2 + 0.5) out.push(at); }
  return out;
}

interface Plan { kind: BuildingKind; x: number; z: number; w: number; d: number }
function slabRect(map: GameMap, x0: number, z0: number, x1: number, z1: number, y: number, hole: [number, number, number, number] | null, kind: BoxKind = 'slab', tex = 0): void {
  if (!hole) { addBox(map, { x0, z0, x1, z1, y0: y - SLAB, y1: y, kind, tex }); return; }
  const [hx0, hz0, hx1, hz1] = hole;
  addBox(map, { x0, z0, x1, z1: hz0, y0: y - SLAB, y1: y, kind, tex }); addBox(map, { x0, z0: hz1, x1, z1, y0: y - SLAB, y1: y, kind, tex });
  addBox(map, { x0, z0: hz0, x1: hx0, z1: hz1, y0: y - SLAB, y1: y, kind, tex }); addBox(map, { x0: hx1, z0: hz0, x1, z1: hz1, y0: y - SLAB, y1: y, kind, tex });
}

/** 바깥 벽 네 변 + 창·문. 반환: 벽 높이 */
function shell(map: GameMap, rng: () => number, b: Building, floors: number, opts: { doorW?: number; doorH?: number; winEvery?: number; winGap?: [number, number] | null; doors?: 1 | 2 }): void {
  const hx = b.w / 2, hz = b.d / 2, H = b.h, doorW = opts.doorW ?? DOOR_W, doorH = opts.doorH ?? DOOR_H, every = opts.winEvery ?? 3.2;
  const win: [number, number] | null = opts.winGap === undefined ? [WIN_Y0, WIN_Y1] : opts.winGap;
  const doorOff = (span: number): number => (rng() - 0.5) * Math.max(0, span - doorW - 2.4);
  const front = b.door === 'z' ? doorOff(b.w) : doorOff(b.d), back = opts.doors === 1 ? null : front + (rng() - 0.5) * 1.2;
  // 변마다 [축, 위치, 시작, 끝, 중심, 문 위치]
  const sides: Array<['x' | 'z', number, number, number, number, number | null]> = [
    ['x', b.z - hz, b.x - hx, b.x + hx, b.x, b.door === 'z' ? b.x + front : null], ['x', b.z + hz, b.x - hx, b.x + hx, b.x, b.door === 'z' && back !== null ? b.x + back : null],
    ['z', b.x - hx, b.z - hz, b.z + hz, b.z, b.door === 'x' ? b.z + front : null], ['z', b.x + hx, b.z - hz, b.z + hz, b.z, b.door === 'x' && back !== null ? b.z + back : null],
  ];
  for (const [along, c, from, to, center, door] of sides) {
    const ops: Opening[] = [];
    if (win) for (const at of windowSpots(to - from, center, door, every)) { const gaps: Array<[number, number]> = []; for (let f = 0; f < floors; f++) gaps.push([f * FLOOR_H + win[0], f * FLOOR_H + win[1]]); ops.push({ at, w: WIN_W, gaps }); }
    if (door !== null) { const gaps: Array<[number, number]> = [[0, doorH]]; if (win) for (let f = 1; f < floors; f++) gaps.push([f * FLOOR_H + win[0], f * FLOOR_H + win[1]]); ops.push({ at: door, w: doorW, gaps }); }
    wallSide(map, b, along, c, from, to, b.g, H, ops);
  }
}

/** 실내 계단(벽을 따라 x 방향으로 오름). 위층 바닥판에는 계단 위 구멍을 냅니다. */
function stairsInside(map: GameMap, rng: () => number, b: Building): [number, number, number, number] {
  // 문이 없는 벽을 따라 오릅니다: 문이 x 변(b.door==='x')에 있으면 z 변 안쪽을 따라 x 방향으로, 아니면 x 변 안쪽을 따라 z 방향으로.
  // 지역 좌표 (a: 오르는 방향, c: 벽에서 안쪽 방향)를 월드 (x,z)로 바꿔 씁니다.
  const runX = b.door === 'x', steps = 11, rise = FLOOR_H / steps, run = 0.4, width = 1.15, len = steps * run;
  const ha = (runX ? b.w : b.d) / 2, hc = (runX ? b.d : b.w) / 2, ca = runX ? b.x : b.z, cc = runX ? b.z : b.x;
  const dir = rng() < 0.5 ? 1 : -1, side = rng() < 0.5 ? -1 : 1;
  const cIn = cc + side * (hc - WALL_T / 2 - width / 2 - 0.02), a0 = dir > 0 ? ca - ha + WALL_T / 2 + 0.6 : ca + ha - WALL_T / 2 - 0.6;
  const rect = (a1: number, a2: number, c1: number, c2: number): [number, number, number, number] => (runX ? [Math.min(a1, a2), Math.min(c1, c2), Math.max(a1, a2), Math.max(c1, c2)] : [Math.min(c1, c2), Math.min(a1, a2), Math.max(c1, c2), Math.max(a1, a2)]);
  for (let k = 1; k <= steps; k++) { const [x0, z0, x1, z1] = rect(a0 + dir * (k - 1) * run, a0 + dir * k * run, cIn - width / 2, cIn + width / 2); addBox(map, { x0, z0, x1, z1, y0: b.g, y1: b.g + rise * k, kind: 'step', tex: 0 }); }
  const top = b.g + FLOOR_H, hole = rect(a0 + dir * 3 * run, a0 + dir * len, cIn - width / 2 - 0.02, cIn + width / 2 + 0.02);
  // 구멍 가장자리 난간: 방 쪽 긴 변과 출발 쪽 짧은 변
  const rc = cIn - side * (width / 2 + 0.06);
  { const [x0, z0, x1, z1] = rect(a0 + dir * 3 * run, a0 + dir * len, rc - 0.05, rc + 0.05); addBox(map, { x0, z0, x1, z1, y0: top, y1: top + 1.0, kind: 'rail', tex: 0 }); }
  { const e = a0 + dir * 3 * run, [x0, z0, x1, z1] = rect(e - 0.05, e + 0.05, cIn - width / 2, cIn + width / 2); addBox(map, { x0, z0, x1, z1, y0: top, y1: top + 1.0, kind: 'rail', tex: 0 }); }
  const pt = (a: number, c: number): [number, number] => (runX ? [a, c] : [c, a]), [bx, bz] = pt(a0 + dir * 0.2, cIn - side * 1.1), [tx, tz] = pt(a0 + dir * (len + 0.8), cIn);
  b.stairs = { bx, bz, tx, tz, top };
  return hole;
}

function crate(map: GameMap, x: number, z: number, y: number, s: number, kind: BoxKind = 'crate', h = s * 2): void { addBox(map, { x0: x - s, x1: x + s, z0: z - s, z1: z + s, y0: y, y1: y + h, kind, tex: 0 }); }

/** 건물 하나를 짓습니다. g 는 1층 바닥 높이. */
function construct(map: GameMap, rng: () => number, p: Plan, g: number, style: number): Building {
  const b: Building = { kind: p.kind, x: p.x, z: p.z, w: p.w, d: p.d, g, h: FLOOR_H, floors: 1, tex: style, door: p.w >= p.d ? 'z' : 'x', roof: 'flat', stairs: null, windows: [] };
  if (rng() < 0.3) b.door = b.door === 'z' ? 'x' : 'z';
  const hx = b.w / 2 - WALL_T / 2, hz = b.d / 2 - WALL_T / 2;
  // 바닥판(밑 지형과 높이가 달라도 건물 바닥이 떠 보이지 않게 기초를 깔아 둡니다)
  addBox(map, { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, y0: g - 1.2, y1: g, kind: 'slab', tex: 1 });
  switch (p.kind) {
    case 'house': {
      b.roof = rng() < 0.7 ? 'gable' : 'flat'; shell(map, rng, b, 1, {});
      addBox(map, { x0: b.x - b.w / 2 - 0.2, x1: b.x + b.w / 2 + 0.2, z0: b.z - b.d / 2 - 0.2, z1: b.z + b.d / 2 + 0.2, y0: g + b.h, y1: g + b.h + SLAB, kind: 'roof', tex: 0 });
      break;
    }
    case 'villa': case 'barracks': {
      const two = p.kind === 'villa'; b.floors = two ? 2 : 1; b.h = FLOOR_H * b.floors; b.roof = two && rng() < 0.5 ? 'gable' : 'flat';
      if (p.kind === 'barracks') b.tex = 4;
      shell(map, rng, b, b.floors, {});
      if (two) { const hole = stairsInside(map, rng, b); slabRect(map, b.x - hx, b.z - hz, b.x + hx, b.z + hz, g + FLOOR_H, hole); }
      addBox(map, { x0: b.x - b.w / 2 - 0.2, x1: b.x + b.w / 2 + 0.2, z0: b.z - b.d / 2 - 0.2, z1: b.z + b.d / 2 + 0.2, y0: g + b.h, y1: g + b.h + SLAB, kind: 'roof', tex: 0 });
      break;
    }
    case 'warehouse': case 'barn': {
      b.h = 6.4; b.roof = p.kind === 'barn' ? 'gable' : 'flat'; b.tex = p.kind === 'barn' ? 5 : 6; b.door = p.w >= p.d ? 'x' : 'z';
      shell(map, rng, b, 1, { doorW: 4.2, doorH: 4.2, winEvery: 4.5, winGap: [4.4, 5.5] });
      addBox(map, { x0: b.x - b.w / 2 - 0.3, x1: b.x + b.w / 2 + 0.3, z0: b.z - b.d / 2 - 0.3, z1: b.z + b.d / 2 + 0.3, y0: g + b.h, y1: g + b.h + SLAB, kind: 'roof', tex: 0 });
      // 안쪽 상자 더미(긴 벽 쪽에 붙여 가운데 통로를 비웁니다)
      const along = b.door === 'x', n = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const s = 0.6 + rng() * 0.35, t = (rng() - 0.5) * ((along ? b.w : b.d) - 6), side = rng() < 0.5 ? -1 : 1;
        const cx = along ? b.x + t : b.x + side * (hx - s - 0.2), cz = along ? b.z + side * (hz - s - 0.2) : b.z + t, kind: BoxKind = p.kind === 'barn' ? 'hay' : 'crate';
        crate(map, cx, cz, g, s, kind); if (rng() < 0.45) crate(map, cx, cz, g + s * 2, s * 0.9, kind);
      }
      break;
    }
    case 'shed': {
      b.h = 2.8; b.tex = 6; shell(map, rng, b, 1, { winGap: null, doors: 1 });
      addBox(map, { x0: b.x - b.w / 2 - 0.15, x1: b.x + b.w / 2 + 0.15, z0: b.z - b.d / 2 - 0.15, z1: b.z + b.d / 2 + 0.15, y0: g + b.h, y1: g + b.h + 0.15, kind: 'roof', tex: 0 });
      break;
    }
    case 'ruin': {
      // 무너진 집: 벽 높이가 제각각이고 지붕이 없습니다. 낮은 벽은 엄폐물이 됩니다.
      b.roof = 'none'; b.h = 3; b.tex = 7; const hx2 = b.w / 2, hz2 = b.d / 2;
      for (const [along, c, from, to] of [['x', b.z - hz2, b.x - hx2, b.x + hx2], ['x', b.z + hz2, b.x - hx2, b.x + hx2], ['z', b.x - hx2, b.z - hz2, b.z + hz2], ['z', b.x + hx2, b.z - hz2, b.z + hz2]] as const) {
        let cur = from; while (cur < to - 0.3) {
          const len = Math.min(to - cur, 1.2 + rng() * 3), hgt = rng() < 0.25 ? 0 : 0.8 + rng() * 2.4;
          if (hgt > 0) addBox(map, along === 'x' ? { x0: cur, x1: cur + len, z0: c - WALL_T / 2, z1: c + WALL_T / 2, y0: g, y1: g + hgt, kind: 'wall', tex: 7 } : { x0: c - WALL_T / 2, x1: c + WALL_T / 2, z0: cur, z1: cur + len, y0: g, y1: g + hgt, kind: 'wall', tex: 7 });
          cur += len;
        }
      }
      for (let i = 0; i < 2; i++) crate(map, b.x + (rng() - 0.5) * (b.w - 3), b.z + (rng() - 0.5) * (b.d - 3), g, 0.45 + rng() * 0.3, 'rock', 0.5 + rng() * 0.6);
      break;
    }
    case 'tower': {
      // 감시탑: 기둥 네 개 위의 발판(높이 6m)과 바깥 계단. 위에 오르면 멀리 보입니다.
      b.roof = 'none'; b.tex = 8; const top = g + 6, s = b.w / 2, stepsN = 20, rise = 6 / stepsN, run = 0.36, width = 1.0;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) addBox(map, { x0: b.x + sx * s - (sx > 0 ? 0.3 : 0), x1: b.x + sx * s + (sx < 0 ? 0.3 : 0), z0: b.z + sz * s - (sz > 0 ? 0.3 : 0), z1: b.z + sz * s + (sz < 0 ? 0.3 : 0), y0: g, y1: top, kind: 'post', tex: 0 });
      addBox(map, { x0: b.x - s, x1: b.x + s, z0: b.z - s, z1: b.z + s, y0: top - 0.25, y1: top, kind: 'slab', tex: 2 });
      const sdir = rng() < 0.5 ? 1 : -1, sz0 = b.z + sdir * (s + width / 2);
      // 계단은 발판 옆을 따라 +x 쪽으로 오르고, 맨 윗단이 발판의 +x 모서리 옆에 닿습니다.
      for (let k = 1; k <= stepsN; k++) { const a = b.x + s - (stepsN + 1 - k) * run, e = a + run; addBox(map, { x0: a, x1: e, z0: sz0 - width / 2, z1: sz0 + width / 2, y0: g, y1: g + rise * k, kind: 'step', tex: 1 }); }
      // 발판 가장자리 난간(계단이 닿는 변의 +x 끝은 비움)
      const rail = (x0: number, z0: number, x1: number, z1: number): void => addBox(map, { x0, z0, x1, z1, y0: top, y1: top + 1.1, kind: 'rail', tex: 1 });
      rail(b.x - s, b.z - s, b.x - s + 0.1, b.z + s); rail(b.x + s - 0.1, b.z - s, b.x + s, b.z + s);
      if (sdir > 0) { rail(b.x - s, b.z - s, b.x + s, b.z - s + 0.1); rail(b.x - s, b.z + s - 0.1, b.x + s - 1.2, b.z + s); } else { rail(b.x - s, b.z + s - 0.1, b.x + s, b.z + s); rail(b.x - s, b.z - s, b.x + s - 1.2, b.z - s + 0.1); }
      addBox(map, { x0: b.x - s - 0.3, x1: b.x + s + 0.3, z0: b.z - s - 0.3, z1: b.z + s + 0.3, y0: top + 2.4, y1: top + 2.6, kind: 'roof', tex: 0 });
      b.stairs = { bx: b.x + s - stepsN * run - 0.7, bz: sz0, tx: b.x + s - 0.6, tz: b.z + sdir * (s - 0.8), top };
      b.h = 6;
      break;
    }
  }
  map.buildings.push(b);
  return b;
}

// ---------- 전리품 ----------
type Table = Array<[LootKind, WeaponId | null, number]>;
const LOOT_TOWN: Table = [['weapon', 'smg', 13], ['weapon', 'rifle', 12], ['weapon', 'shotgun', 11], ['weapon', 'sniper', 3], ['weapon', 'pistol', 6], ['ammo', null, 22], ['medkit', null, 16], ['armor', null, 9], ['helmet', null, 8]];
const LOOT_MIL: Table = [['weapon', 'smg', 8], ['weapon', 'rifle', 20], ['weapon', 'shotgun', 6], ['weapon', 'sniper', 9], ['weapon', 'pistol', 2], ['ammo', null, 20], ['medkit', null, 12], ['armor', null, 14], ['helmet', null, 12]];
function rollLoot(rng: () => number, table: Table): [LootKind, WeaponId | null] {
  let r = rng() * table.reduce((s, [, , w]) => s + w, 0); for (const [k, w, wt] of table) { r -= wt; if (r <= 0) return [k, w]; }
  return ['ammo', null];
}
function push(map: GameMap, kind: LootKind, weapon: WeaponId | null, x: number, z: number, y: number, b: number): void {
  map.loot.push({ id: map.loot.length, kind, weapon: kind === 'weapon' ? weapon ?? WEAPON_IDS[0] : null, x, z, y, taken: false, b });
}

// ---------- 마을 배치 ----------
const TOWN_NAMES = ['솔빛마을', '바위골', '북부 기지', '붉은 농장', '돌다리', '강변마을', '옛 성터', '높은재', '남부 창고', '물레방아', '안개골', '흰모래', '검은숲', '동부 초소', '은행나무골', '갈대밭', '종탑마을', '서부 기지', '노을언덕', '참나무골', '샘터', '빈 들', '부엉이골', '쇠막골', '푸른 들', '모래섬'];

function planTown(rng: () => number, kind: TownKind, cx: number, cz: number, duel: boolean): Plan[] {
  const out: Plan[] = [], pick = <T>(a: T[]): T => a[Math.floor(rng() * a.length)];
  const grid = (cols: number, rows: number, lotW: number, lotD: number, n: number, make: (x: number, z: number) => Plan | null): void => {
    const slots: Array<[number, number]> = []; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) slots.push([i, j]);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    for (const [i, j] of slots.slice(0, n)) { const p = make(cx + (i - (cols - 1) / 2) * lotW + (rng() - 0.5) * 2.5, cz + (j - (rows - 1) / 2) * lotD + (rng() - 0.5) * 2.5); if (p) out.push(p); }
  };
  const house = (x: number, z: number): Plan => { const k = pick<BuildingKind>(['house', 'house', 'villa', 'villa', 'shed']); return k === 'shed' ? { kind: k, x, z, w: 4 + rng() * 1.5, d: 4 + rng() * 1.5 } : k === 'villa' ? { kind: k, x, z, w: 10.5 + rng() * 2.5, d: 8.5 + rng() * 2 } : { kind: k, x, z, w: 8 + rng() * 3.5, d: 7 + rng() * 3 }; };
  if (duel) { grid(2, 2, 18, 16, 2 + Math.floor(rng() * 3), house); return out; }
  switch (kind) {
    case 'city': grid(4, 4, 20, 18, 11 + Math.floor(rng() * 4), (x, z) => (rng() < 0.12 ? { kind: 'warehouse', x, z, w: 15, d: 12 } : rng() < 0.6 ? { kind: 'villa', x, z, w: 11 + rng() * 2.5, d: 9 + rng() * 2 } : house(x, z))); break;
    case 'village': grid(3, 3, 19, 17, 5 + Math.floor(rng() * 4), house); break;
    case 'farm': {
      out.push({ kind: 'barn', x: cx, z: cz, w: 18 + rng() * 4, d: 11 + rng() * 2 });
      out.push({ kind: rng() < 0.5 ? 'villa' : 'house', x: cx + 24, z: cz + (rng() - 0.5) * 8, w: 10.5, d: 8.5 });
      if (rng() < 0.7) out.push({ kind: 'shed', x: cx - 18, z: cz + 12, w: 4.5, d: 4.5 });
      if (rng() < 0.6) out.push({ kind: 'tower', x: cx - 16, z: cz - 14, w: 3.2, d: 3.2 });
      break;
    }
    case 'military': {
      out.push({ kind: 'warehouse', x: cx - 14, z: cz - 10, w: 20, d: 14 }, { kind: 'warehouse', x: cx + 16, z: cz - 12, w: 16, d: 12 });
      out.push({ kind: 'barracks', x: cx - 12, z: cz + 16, w: 16, d: 8 }, { kind: 'barracks', x: cx + 12, z: cz + 16, w: 16, d: 8 });
      out.push({ kind: 'tower', x: cx - 34, z: cz - 32, w: 3.2, d: 3.2 }, { kind: 'tower', x: cx + 34, z: cz + 32, w: 3.2, d: 3.2 });
      if (rng() < 0.6) out.push({ kind: 'villa', x: cx + 1, z: cz + 2, w: 11, d: 9 });
      break;
    }
    case 'ruins': grid(3, 3, 16, 15, 5 + Math.floor(rng() * 3), (x, z) => (rng() < 0.75 ? { kind: 'ruin', x, z, w: 7 + rng() * 5, d: 6 + rng() * 4 } : { kind: 'shed', x, z, w: 4.5, d: 4.5 })); break;
  }
  return out;
}
const reachOf = (plans: Plan[], cx: number, cz: number): number => plans.reduce((r, p) => Math.max(r, Math.sqrt((p.x - cx) ** 2 + (p.z - cz) ** 2) + Math.max(p.w, p.d) / 2 + (p.kind === 'tower' ? 8 : 0)), 10);

export function generateMap(seed: number, mode: Mode): GameMap {
  const rng = makeRng(seed), half = MAP_HALF[mode], duel = mode === 'duel', terrain = makeTerrain(seed, mode, half), W = terrain.water;
  const map: GameMap = { seed, mode, half, terrain, boxes: [], buildings: [], trees: [], rocks: [], bushes: [], compounds: [], roads: [], loot: [], spawns: [], grid: new Map() };
  const gAt = (x: number, z: number): number => groundAt(terrain, x, z);
  const dry = (x: number, z: number, r: number): boolean => { for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (gAt(x + ox, z + oz) < W + 0.8) return false; return true; };

  // 1) 마을 자리: 물이 아니고 너무 가파르지 않은 곳, 서로 떨어뜨려서
  const kinds: TownKind[] = duel ? ['village', 'village', 'ruins', 'village'] : ['city', 'city', 'military', 'military', 'farm', 'farm', 'farm', 'ruins', 'ruins', 'ruins', ...Array<TownKind>(12).fill('village')];
  const towns = kinds.length, minGap = duel ? 58 : 88;
  const plans: Plan[][] = [];
  for (let tries = 0; map.compounds.length < towns && tries < 6000; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * (duel ? 0.7 : 0.86), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!dry(x, z, 24) || !map.compounds.every(c => Math.hypot(c.x - x, c.z - z) > minGap)) continue;
    const spread = Math.abs(gAt(x + 25, z) - gAt(x - 25, z)) + Math.abs(gAt(x, z + 25) - gAt(x, z - 25)); if (spread > 14 && tries < 4800) continue;
    const kind = kinds[map.compounds.length], p = planTown(rng, kind, x, z, duel);
    const g = Math.max(W + 1.2, (gAt(x, z) + gAt(x + 15, z) + gAt(x - 15, z) + gAt(x, z + 15) + gAt(x, z - 15)) / 5);
    map.compounds.push({ x, z, r: reachOf(p, x, z) + 6, g, kind, name: TOWN_NAMES[map.compounds.length % TOWN_NAMES.length] }); plans.push(p);
  }
  // 2) 땅 고르기(마을)와 길(가장 가까운 두 마을과 잇고, 물을 지나면 둑을 쌓음)
  for (const c of map.compounds) flatten(terrain, c.x, c.z, c.r + 2, duel ? 18 : 30, c.g);
  const cs = map.compounds, used = new Set<string>();
  for (let i = 0; i < cs.length; i++) {
    const near = cs.map((o, j) => ({ j, d: Math.hypot(o.x - cs[i].x, o.z - cs[i].z) })).filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { j } of near) { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (used.has(k)) continue; used.add(k); map.roads.push([cs[i].x, cs[i].z, cs[j].x, cs[j].z]); causeway(terrain, cs[i].x, cs[i].z, cs[j].x, cs[j].z, 4); }
  }
  let tmax = -Infinity; for (let i = 0; i < terrain.h.length; i++) if (terrain.h[i] > tmax) tmax = terrain.h[i]; terrain.max = tmax;

  // 3) 건물과 마을 소품
  map.compounds.forEach((c, ci) => {
    const style = Math.floor(rng() * 4), mil = c.kind === 'military';
    for (const p of plans[ci]) {
      const b = construct(map, rng, p, c.g, p.kind === 'house' || p.kind === 'villa' ? (style + Math.floor(rng() * 2)) % 4 : style), bi = map.buildings.length - 1;
      // 층마다 전리품 1~3개(계단 자리는 피함)
      const table = mil ? LOOT_MIL : LOOT_TOWN, floors = b.kind === 'tower' ? 0 : b.floors;
      for (let f = 0; f < floors; f++) {
        const n = (b.kind === 'shed' ? 1 : 1 + Math.floor(rng() * (b.kind === 'warehouse' ? 4 : 3)));
        for (let k = 0; k < n; k++) {
          for (let t = 0; t < 8; t++) {
            const x = b.x + (rng() - 0.5) * (b.w - 2.2), z = b.z + (rng() - 0.5) * (b.d - 2.2), y = b.g + f * FLOOR_H;
            if (b.stairs && Math.abs(z - b.stairs.bz) < 1.2) continue; if (blockedAt(map, x, z, 0.4, y)) continue;
            const [kind, weapon] = rollLoot(rng, table); push(map, kind, weapon, x, z, y, bi); break;
          }
        }
      }
      if (b.kind === 'tower') { const [kind, weapon] = rng() < 0.5 ? ['weapon', 'sniper'] as [LootKind, WeaponId] : rollLoot(rng, LOOT_MIL); push(map, kind, weapon, b.x, b.z, b.g + b.h, bi); }
      if (b.kind !== 'tower' && rng() < 0.55) { const s = 0.5 + rng() * 0.3, ox = b.x + (b.w / 2 + 1.4) * (rng() < 0.5 ? -1 : 1), oz = b.z + (rng() - 0.5) * b.d; if (!blockedAt(map, ox, oz, s + 0.5, c.g)) crate(map, ox, oz, c.g, s); }
    }
    if (mil) militaryYard(map, rng, c);
    else if (c.kind === 'farm') farmYard(map, rng, c);
  });

  // 4) 숲·나무·덤불·바위: 숲 잡음이 큰 곳에 모아 심습니다.
  const fl = lattice(makeRng(seed ^ 0x2f6b1d3)), forest = (x: number, z: number): number => vnoise(fl, x / 120 + 50, z / 120 + 50);
  const clear = (x: number, z: number, pad: number): boolean => map.compounds.every(c => Math.hypot(c.x - x, c.z - z) > c.r + pad) && map.roads.every(([ax, az, bx, bz]) => segDist(x, z, ax, az, bx, bz) > 4 + pad);
  const treeAt = (x: number, z: number, s: number, pine: boolean): void => { const y = gAt(x, z); map.trees.push({ x, z, y, s, pine }); addBox(map, { x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: y - 0.5, y1: y + 7, kind: 'trunk', tex: 0 }); };
  const area = (half * 2) ** 2, trees = Math.round(area / (duel ? 420 : 260));
  for (let i = 0, tries = 0; i < trees && tries < trees * 8; tries++) {
    const x = (rng() * 2 - 1) * half * 0.97, z = (rng() * 2 - 1) * half * 0.97, f = forest(x, z), y = gAt(x, z);
    if (rng() > (f - 0.38) * 2.6 || y < W + 0.4 || !clear(x, z, 3)) continue;
    treeAt(x, z, 0.75 + rng() * 0.7, y > 14 ? rng() < 0.8 : rng() < 0.35); i++;
  }
  for (let i = 0, tries = 0; i < trees * 0.15 && tries < trees; tries++) { const x = (rng() * 2 - 1) * half * 0.95, z = (rng() * 2 - 1) * half * 0.95; if (gAt(x, z) < W + 0.4 || !clear(x, z, 4)) continue; treeAt(x, z, 0.8 + rng() * 0.6, rng() < 0.4); i++; }
  const bushes = Math.round(area / (duel ? 260 : 520));
  for (let i = 0, tries = 0; i < bushes && tries < bushes * 4; tries++) { const x = (rng() * 2 - 1) * half * 0.97, z = (rng() * 2 - 1) * half * 0.97, y = gAt(x, z); if (y < W + 0.2 || !clear(x, z, 1)) continue; map.bushes.push({ x, z, y, s: 0.7 + rng() * 0.8 }); i++; }
  const rocks = duel ? 26 : 190;
  for (let i = 0, tries = 0; i < rocks && tries < rocks * 10; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.95, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clear(x, z, 3) || blockedAt(map, x, z, 3)) continue;
    const big = rng() < 0.18, sx = (1.2 + rng() * 2.2) * (big ? 2 : 1), sz = (1.2 + rng() * 2.2) * (big ? 2 : 1), sy = (0.9 + rng() * 1.5) * (big ? 1.8 : 1), y = gAt(x, z);
    map.rocks.push({ x, z, y, sx, sy, sz, ry: rng() * Math.PI }); addBox(map, { x0: x - sx * 0.8, x1: x + sx * 0.8, z0: z - sz * 0.8, z1: z + sz * 0.8, y0: y - 0.6, y1: y + sy, kind: 'rock', tex: 0 }); i++;
  }
  // 5) 들판 전리품
  const field = duel ? 10 : 110;
  for (let i = 0, tries = 0; i < field && tries < field * 10; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.9, x = Math.cos(a) * r, z = Math.sin(a) * r, y = gAt(x, z); if (y < W || !clear(x, z, 1) || blockedAt(map, x, z, 0.6, y)) continue;
    const [kind, weapon] = rollLoot(rng, LOOT_TOWN); push(map, kind, weapon, x, z, y, -1); i++;
  }
  // 들판의 응급 보급소: 낮은 모래주머니 엄폐와 회복·탄약을 함께 제공합니다.
  for (let i = 0; i < (duel ? 2 : 8); i++) {
    const angle = i * Math.PI * 2 / (duel ? 2 : 8), radius = half * 0.48;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius, y = gAt(x, z);
    if (y < W + 0.5 || !clear(x, z, 6) || blockedAt(map, x, z, 6, y)) continue;
    // 울퉁불퉁한 지형에서는 시설이 뜨거나 묻히지 않도록 생성을 생략합니다.
    if (Math.max(...[-3, 3].flatMap(dx => [-3, 3].map(dz => Math.abs(gAt(x + dx, z + dz) - y)))) > 0.45) continue;
    for (const side of [-1, 1]) crate(map, x + side * 2.5, z, gAt(x + side * 2.5, z), 0.55, 'sandbag', 0.8);
    push(map, 'medkit', null, x, z - 1, y, -1); push(map, 'ammo', null, x, z + 1, y, -1);
  }
  // 6) 지상 출발 자리. 대전은 서로 정반대, 배틀로열은 수송기 없이 시작할 때(시험·시뮬레이션)만 씁니다.
  if (duel) {
    const a = rng() * Math.PI * 2;
    for (const k of [0, 1]) spawnNear(map, rng, Math.cos(a + k * Math.PI) * half * 0.72, Math.sin(a + k * Math.PI) * half * 0.72);
  } else for (let i = 0; i < BR_FILL; i++) { const a = (i / BR_FILL) * Math.PI * 2 + (rng() - 0.5) * 0.05, r = half * (0.3 + rng() * 0.55); spawnNear(map, rng, Math.cos(a) * r, Math.sin(a) * r); }
  const anchors = map.loot.filter(l => l.kind === 'weapon' || l.kind === 'ammo');
  for (let i = 0; i < anchors.length; i += 2) {
    const at = anchors[i], x = at.x + 0.65, z = at.z;
    if (blockedAt(map, x, z, 0.25, at.y)) continue;
    map.loot.push({ id: map.loot.length, kind: 'attachment', part: PART_IDS[((i / 2 + seed) >>> 0) % PART_IDS.length], weapon: null, x, z, y: at.y, taken: false, b: at.b });
  }
  return map;
}

function militaryYard(map: GameMap, rng: () => number, c: Compound): void {
  // 둘레 콘크리트 담(남북에 정문)과 컨테이너·모래주머니
  const R = 40, g = c.g, T = 0.5, H = 2.4, gate = 7;
  const wall = (x0: number, z0: number, x1: number, z1: number): void => addBox(map, { x0, z0, x1, z1, y0: g, y1: g + H, kind: 'wall', tex: 4 });
  wall(c.x - R, c.z - R, c.x - gate / 2, c.z - R + T); wall(c.x + gate / 2, c.z - R, c.x + R, c.z - R + T);
  wall(c.x - R, c.z + R - T, c.x - gate / 2, c.z + R); wall(c.x + gate / 2, c.z + R - T, c.x + R, c.z + R);
  wall(c.x - R, c.z - R, c.x - R + T, c.z - gate / 2); wall(c.x - R, c.z + gate / 2, c.x - R + T, c.z + R);
  wall(c.x + R - T, c.z - R, c.x + R, c.z - gate / 2); wall(c.x + R - T, c.z + gate / 2, c.x + R, c.z + R);
  for (let i = 0; i < 7; i++) {
    const long = rng() < 0.5, x = c.x + (rng() - 0.5) * 56, z = c.z + (rng() - 0.5) * 56, hw = long ? 3.05 : 1.22, hd = long ? 1.22 : 3.05;
    if (blockedAt(map, x, z, 3.8, g)) continue; const tex = Math.floor(rng() * 4);
    addBox(map, { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0: g, y1: g + 2.6, kind: 'container', tex });
    if (rng() < 0.35) addBox(map, { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0: g + 2.6, y1: g + 5.2, kind: 'container', tex: (tex + 1) % 4 });
  }
  for (let i = 0; i < 6; i++) { const x = c.x + (rng() - 0.5) * 60, z = c.z + (rng() - 0.5) * 60, long = rng() < 0.5; if (blockedAt(map, x, z, 2.4, g)) continue; addBox(map, { x0: x - (long ? 1.6 : 0.4), x1: x + (long ? 1.6 : 0.4), z0: z - (long ? 0.4 : 1.6), z1: z + (long ? 0.4 : 1.6), y0: g, y1: g + 1.05, kind: 'sandbag', tex: 0 }); }
}
function farmYard(map: GameMap, rng: () => number, c: Compound): void {
  // 건초 더미와 낮은 울타리
  for (let i = 0; i < 6; i++) { const x = c.x + (rng() - 0.5) * 44, z = c.z + (rng() - 0.5) * 44; if (!blockedAt(map, x, z, 1.6, c.g)) crate(map, x, z, c.g, 0.75, 'hay', 1.2); }
  const R = c.r - 2, fence = (x0: number, z0: number, x1: number, z1: number): void => addBox(map, { x0, z0, x1, z1, y0: c.g, y1: c.g + 1.0, kind: 'rail', tex: 1 });
  const gap = 6; fence(c.x - R, c.z - R, c.x - gap, c.z - R + 0.12); fence(c.x + gap, c.z - R, c.x + R, c.z - R + 0.12); fence(c.x - R, c.z + R - 0.12, c.x + R, c.z + R);
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1), x = ax + dx * t - px, z = az + dz * t - pz; return Math.sqrt(x * x + z * z);
}
function spawnNear(map: GameMap, rng: () => number, x: number, z: number): void {
  for (let i = 0; i < 60; i++) {
    const px = x + (rng() - 0.5) * 14 * (1 + i / 8), pz = z + (rng() - 0.5) * 14 * (1 + i / 8);
    if (Math.abs(px) < map.half - 2 && Math.abs(pz) < map.half - 2 && groundAt(map.terrain, px, pz) > map.terrain.water && !blockedAt(map, px, pz, 1.2)) { map.spawns.push({ x: px, z: pz }); return; }
  }
  map.spawns.push({ x, z });
}

// ---------- 충돌 ----------
/** (x,z)에서 발을 디딜 수 있는 가장 높은 면(지형 또는 상자 윗면 중 maxY 이하). */
export function supportAt(map: GameMap, x: number, z: number, maxY: number, r = 0.22): number {
  let best = groundAt(map.terrain, x, z); const cx = cellOf(x), cz = cellOf(z), l = map.grid.get(key(cx, cz)); if (!l) return best;
  for (const i of l) { const b = map.boxes[i]; if (b.y1 <= maxY && b.y1 > best && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) best = b.y1; }
  return best;
}
/** 발 높이 y 에 선 사람(키 h)을 막는 상자인지: 턱(STEP_UP)보다 높고 머리보다 낮게 걸친 것. */
const blocks = (b: Box, y: number, h: number): boolean => b.y1 > y + STEP_UP && b.y0 < y + h;

/** 이 원(반지름 r)이 발 높이 y 에서 막히는 상자와 겹치는지. y 를 빼면 그 자리의 땅 높이입니다. */
export function blockedAt(map: GameMap, x: number, z: number, r: number, y?: number, h = PLAYER.height): boolean {
  const fy = y ?? supportAt(map, x, z, groundAt(map.terrain, x, z) + STEP_UP);
  for (let cx = cellOf(x - r); cx <= cellOf(x + r); cx++) for (let cz = cellOf(z - r); cz <= cellOf(z + r); cz++) {
    const l = map.grid.get(key(cx, cz)); if (!l) continue;
    for (const i of l) { const b = map.boxes[i]; if (!blocks(b, fy, h)) continue; if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true; }
  }
  return false;
}

/** 원을 상자 밖으로 밀어냅니다. 벽에 닿았는지 반환합니다. y 는 발 높이(빼면 땅 높이). */
export function pushOut(map: GameMap, p: { x: number; z: number }, r: number, y?: number, h = PLAYER.height): boolean {
  const fy = y ?? supportAt(map, p.x, p.z, groundAt(map.terrain, p.x, p.z) + STEP_UP);
  let hit = false;
  for (let iter = 0; iter < 2; iter++) for (let cx = cellOf(p.x - r); cx <= cellOf(p.x + r); cx++) for (let cz = cellOf(p.z - r); cz <= cellOf(p.z + r); cz++) {
    const l = map.grid.get(key(cx, cz)); if (!l) continue;
    for (const i of l) {
      const b = map.boxes[i]; if (!blocks(b, fy, h)) continue;
      const nx = Math.max(b.x0, Math.min(p.x, b.x1)), nz = Math.max(b.z0, Math.min(p.z, b.z1)), dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue; hit = true;
      if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else { // 중심이 상자 안: 가장 가까운 면으로 나옵니다
        const l0 = p.x - b.x0, l1 = b.x1 - p.x, l2 = p.z - b.z0, l3 = b.z1 - p.z, m = Math.min(l0, l1, l2, l3);
        if (m === l0) p.x = b.x0 - r; else if (m === l1) p.x = b.x1 + r; else if (m === l2) p.z = b.z0 - r; else p.z = b.z1 + r;
      }
    }
  }
  return hit;
}
/** 머리 위를 막는 가장 낮은 면(점프 천장). */
export function ceilingAt(map: GameMap, x: number, z: number, y: number, r = 0.25): number {
  let best = Infinity; const l = map.grid.get(key(cellOf(x), cellOf(z))); if (!l) return best;
  for (const i of l) { const b = map.boxes[i]; if (b.y0 >= y && b.y0 < best && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) best = b.y0; }
  return best;
}
export function inWater(map: GameMap, x: number, z: number, y: number): number { const g = groundAt(map.terrain, x, z); return y <= g + 0.05 ? Math.max(0, map.terrain.water - g) : 0; }

// ---------- 광선 ----------
let seen = new Int32Array(1 << 14); let stamp = 0;
/** 광선과 지형·모든 상자의 첫 교차 거리(없으면 Infinity). dx,dy,dz 는 정규화된 방향. */
export function rayWorld(map: GameMap, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  if (seen.length < map.boxes.length) seen = new Int32Array(map.boxes.length * 2);
  stamp = (stamp + 1) | 0; let best = Infinity;
  // 상자: 2D 격자를 광선 순서대로 지나가며(DDA) 검사합니다.
  let cx = cellOf(ox), cz = cellOf(oz); const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
  let tx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity, tz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity, tEnter = 0;
  for (let guard = 0; guard < 400; guard++) {
    const l = map.grid.get(key(cx, cz));
    if (l) for (const i of l) {
      if (seen[i] === stamp) continue; seen[i] = stamp;
      const b = map.boxes[i]; let t0 = 0, t1 = Math.min(maxT, best), ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        const o = a === 0 ? ox : a === 1 ? oy : oz, d = a === 0 ? dx : a === 1 ? dy : dz, lo = a === 0 ? b.x0 : a === 1 ? b.y0 : b.z0, hi = a === 0 ? b.x1 : a === 1 ? b.y1 : b.z1;
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) ok = false; continue; }
        let p = (lo - o) / d, q = (hi - o) / d; if (p > q) { const s = p; p = q; q = s; }
        if (p > t0) t0 = p; if (q < t1) t1 = q; if (t0 > t1) ok = false;
      }
      if (ok && t0 < best) best = t0;
    }
    const next = Math.min(tx, tz); if (next > maxT || best <= next || next === Infinity) break;
    tEnter = next; if (tx < tz) { tx += tdx; cx += sx; } else { tz += tdz; cz += sz; }
  }
  void tEnter;
  // 지형: 일정 간격으로 따라가며 땅 밑으로 들어가는 첫 지점을 찾고 반으로 나눠 다듬습니다.
  const lim = Math.min(maxT, best), t = map.terrain;
  if (!(dy > 0 && oy > t.max)) {
    const step = 1.5; let prev = 0;
    for (let s = step; s <= lim + step; s += step) {
      const q = Math.min(s, lim), y = oy + dy * q;
      if (y < groundAt(t, ox + dx * q, oz + dz * q)) {
        let a = prev, b = q; for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (oy + dy * m < groundAt(t, ox + dx * m, oz + dz * m)) b = m; else a = m; }
        return Math.min(best, b);
      }
      if (dy > 0 && y > t.max) break;
      prev = q; if (q >= lim) break;
    }
  }
  return best;
}

/** 두 점 사이가 벽이나 언덕에 가려지지 않았는지. */
export function lineClear(map: GameMap, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz); if (len < 1e-6) return true;
  return rayWorld(map, ax, ay, az, dx / len, dy / len, dz / len, len - 0.05) === Infinity;
}
