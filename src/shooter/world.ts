// ZERO ZONE — 지도 생성(마을·건물·차량·컨테이너·바위·나무·전리품)과 충돌·광선 검사. 화면과 무관한 순수 로직이라 시드가 같으면 어디서나 같은 지도가 나옵니다.
import { emptyTerrain, groundHeight, groundRayDistance, planTerrain, waterDepth, type Terrain } from './terrain';
import { MAP_HALF, PLAYER, WEAPON_IDS, makeRng, type Attachments, type Mode, type PartId, type WeaponId } from './config';

/** 위에서 본 직사각형 + 높이 범위. 벽·바위·상자·나무 기둥·차량 모두 이 모양입니다. */
export type BoxKind = 'wall' | 'ceiling' | 'rock' | 'crate' | 'trunk' | 'fence' | 'vehicle' | 'container' | 'prop';
export interface Box { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; kind: BoxKind; tex: number }
export type BuildingType = 'house' | 'cabin' | 'apartment' | 'warehouse' | 'garage' | 'shop' | 'tower' | 'barn' | 'bunker' | 'station' | 'church' | 'clinic' | 'diner' | 'silo' | 'hangar';
export type RoofKind = 'flat' | 'gable' | 'shed';
export interface Building { x: number; z: number; w: number; d: number; tex: number; door: 'x' | 'z'; floor: number; type: BuildingType; /** 벽 높이 */ h: number; roof: RoofKind }
export type LootKind = 'weapon' | 'ammo' | 'medkit' | 'bandage' | 'armor' | 'attach' | 'helmet' | 'boost' | 'grenade';
export interface Loot { id: number; kind: LootKind; weapon: WeaponId | null; x: number; z: number; taken: boolean; /** 총기 파츠 */ part?: PartId | null; /** 헬멧 등급 */ level?: number; /** 떨어진 총에 달려 있던 파츠 */ att?: Attachments }
export interface Tree { x: number; z: number; s: number; pine: boolean }
export interface Rock { x: number; z: number; sx: number; sy: number; sz: number; ry: number }
export type PropKind = 'car' | 'jeep' | 'truck' | 'van' | 'bus' | 'container' | 'barrel' | 'hay' | 'pole' | 'tank' | 'tent' | 'sandbag' | 'dumpster' | 'canopy' | 'pump' | 'fence' | 'bush' | 'sign' | 'barrier' | 'ruin' | 'stump' | 'log' | 'stonewall' | 'rubble' | 'pallet';
/** 눈에 보이는 소품. w·d·h 는 ry=0 일 때의 가로(x)·세로(z)·높이이고, 충돌 상자는 world.ts 가 따로 만듭니다. */
export interface Prop { kind: PropKind; x: number; z: number; ry: number; /** 보기만 하는 작은 기울기 */ jit: number; w: number; d: number; h: number; c: number; /** 컨테이너 층, 차량·울타리 변형 */ v: number; wreck: boolean; /** 솔로 배틀로열에서 이 차량의 충돌 상자 번호(운전하면 옮겨 다닙니다) */ box?: number }
export type Theme = 'village' | 'urban' | 'industrial' | 'farm' | 'military';
export interface Compound { x: number; z: number; r: number; theme: Theme; name: string; /** 고층 도심 중심지 여부 */ downtown?: boolean }
/** 중앙 도심 배치와 시각적인 도로 폭은 같은 수치를 공유합니다. */
export const METROPOLIS = { cols: 4, rows: 4, lotW: 19.5, lotD: 18.5, streetWidth: 4.5 } as const;
export interface Site { x: number; z: number; r: number }

export interface GameMap {
  seed: number; mode: Mode; half: number;
  terrain: Terrain; boxes: Box[]; buildings: Building[]; trees: Tree[]; rocks: Rock[]; props: Prop[]; compounds: Compound[]; sites: Site[]; roads: Array<[number, number]>;
  loot: Loot[]; spawns: { x: number; z: number }[];
  /** 충돌·광선 검사용 격자. 칸 크기 CELL 미터. */
  grid: Map<number, number[]>;
}
export const CELL = 16;
const key = (cx: number, cz: number): number => (cx + 512) * 1024 + (cz + 512);
const cellOf = (v: number): number => Math.floor(v / CELL);

export function addBox(map: GameMap, b: Box): void {
  const i = map.boxes.length; map.boxes.push(b);
  for (let cx = cellOf(b.x0); cx <= cellOf(b.x1); cx++) for (let cz = cellOf(b.z0); cz <= cellOf(b.z1); cz++) { const k = key(cx, cz); const l = map.grid.get(k); if (l) l.push(i); else map.grid.set(k, [i]); }
}

/** Update spatial membership when a vehicle collision box moves or is disabled. */
export function moveBox(map: GameMap, i: number, b: Partial<Box>): void {
  const o = map.boxes[i]; if (!o) return;
  // Remove the previous membership, preventing stale vehicle entries from accumulating.
  for (let cx = cellOf(o.x0); cx <= cellOf(o.x1); cx++) for (let cz = cellOf(o.z0); cz <= cellOf(o.z1); cz++) {
    const k = key(cx, cz), l = map.grid.get(k); if (!l) continue;
    const at = l.indexOf(i); if (at >= 0) l.splice(at, 1);
    if (!l.length) map.grid.delete(k);
  }
  Object.assign(o, b);
  if (o.y0 > 100) return;
  for (let cx = cellOf(o.x0); cx <= cellOf(o.x1); cx++) for (let cz = cellOf(o.z0); cz <= cellOf(o.z1); cz++) { const k = key(cx, cz), l = map.grid.get(k); if (!l) map.grid.set(k, [i]); else if (!l.includes(i)) l.push(i); }
}

const WALL_T = 0.35;

/** 한 변을 문틈을 남기고 세웁니다. along 은 변이 뻗는 축('x' 면 x 방향으로 긴 벽). */
function wallSide(map: GameMap, tex: number, along: 'x' | 'z', c: number, from: number, to: number, doorAt: number | null, wallH: number, doorW: number, doorH: number): void {
  const mk = (a: number, b: number, y0: number, y1: number): void => {
    if (b - a < 0.05) return;
    addBox(map, along === 'x' ? { x0: a, x1: b, z0: c - WALL_T / 2, z1: c + WALL_T / 2, y0, y1, kind: 'wall', tex } : { x0: c - WALL_T / 2, x1: c + WALL_T / 2, z0: a, z1: b, y0, y1, kind: 'wall', tex });
  };
  if (doorAt === null) { mk(from, to, 0, wallH); return; }
  const a = doorAt - doorW / 2, b = doorAt + doorW / 2;
  mk(from, a, 0, wallH); mk(b, to, 0, wallH); mk(a, b, doorH, wallH);
}

interface Spec { w: [number, number]; d: [number, number]; h: number; roof: RoofKind; tex: number[]; doorW: number; doorH: number; loot: [number, number]; /** 실내 상자 수 */ crates: [number, number]; tier: 0 | 1 }
const SPEC: Record<BuildingType, Spec> = {
  house:     { w: [8, 12],    d: [7, 10],    h: 3.2, roof: 'gable', tex: [0, 1, 2, 3], doorW: 2.5, doorH: 2.45, loot: [1, 3], crates: [0, 2], tier: 0 },
  cabin:     { w: [5, 6.4],   d: [4.6, 5.6], h: 2.8, roof: 'shed',  tex: [2, 3],       doorW: 2.5, doorH: 2.35, loot: [1, 2], crates: [0, 0], tier: 0 },
  apartment: { w: [11, 14],   d: [9, 11],    h: 6.4, roof: 'flat',  tex: [0, 1, 3],    doorW: 2.5, doorH: 2.45, loot: [3, 5], crates: [1, 2], tier: 0 },
  warehouse: { w: [15, 19],   d: [10, 13],   h: 5,   roof: 'gable', tex: [0],          doorW: 4.2, doorH: 3.6,  loot: [3, 5], crates: [3, 4], tier: 1 },
  garage:    { w: [6.5, 8],   d: [6, 7],     h: 3,   roof: 'shed',  tex: [0, 3],       doorW: 4.2, doorH: 2.6,  loot: [1, 2], crates: [0, 1], tier: 0 },
  shop:      { w: [10, 12.5], d: [8, 9.5],   h: 3.4, roof: 'flat',  tex: [2, 1],       doorW: 2.6, doorH: 2.5,  loot: [2, 4], crates: [0, 0], tier: 0 },
  tower:     { w: [4.6, 5.4], d: [4.6, 5.4], h: 8.8, roof: 'flat',  tex: [0],          doorW: 2.5, doorH: 2.45, loot: [1, 2], crates: [0, 0], tier: 1 },
  barn:      { w: [13, 16],   d: [9, 11],    h: 4,   roof: 'gable', tex: [1],          doorW: 4,   doorH: 3.2,  loot: [2, 3], crates: [1, 2], tier: 0 },
  bunker:    { w: [8, 10],    d: [6, 8],     h: 2.5, roof: 'flat',  tex: [0],          doorW: 2.5, doorH: 2.2,  loot: [2, 4], crates: [1, 2], tier: 1 },
  church:    { w: [7, 8.4],   d: [11.5, 13], h: 4.4, roof: 'gable', tex: [2],        doorW: 3,   doorH: 3.1,  loot: [2, 3], crates: [0, 0], tier: 0 },
  clinic:    { w: [10, 12],   d: [8, 9],    h: 3.4, roof: 'flat',  tex: [3],          doorW: 2.6, doorH: 2.5,  loot: [3, 5], crates: [0, 1], tier: 0 },
  diner:     { w: [9, 11],    d: [6, 7],    h: 3,   roof: 'shed',  tex: [1, 2],       doorW: 2.6, doorH: 2.45, loot: [2, 3], crates: [0, 0], tier: 0 },
  silo:      { w: [4.6, 5.2], d: [4.6, 5.2], h: 12, roof: 'flat',  tex: [0],          doorW: 2.4, doorH: 2.4,  loot: [1, 2], crates: [0, 0], tier: 1 },
  hangar:    { w: [19, 21],   d: [12.5, 14], h: 6.5, roof: 'gable', tex: [0],         doorW: 6.4, doorH: 4.8,  loot: [4, 6], crates: [3, 5], tier: 1 },
  station:   { w: [7, 8.5],   d: [5, 6],     h: 3.2, roof: 'flat',  tex: [2],          doorW: 2.5, doorH: 2.45, loot: [2, 3], crates: [0, 0], tier: 0 },
};
const between = (rng: () => number, [a, b]: [number, number]): number => a + rng() * (b - a);
const pickInt = (rng: () => number, [a, b]: [number, number]): number => a + Math.floor(rng() * (b - a + 1));

function build(map: GameMap, rng: () => number, type: BuildingType, cx: number, cz: number, heightOverride?: number): Building {
  const sp = SPEC[type], w = between(rng, sp.w), d = between(rng, sp.d), tex = sp.tex[Math.floor(rng() * sp.tex.length)];
  const door: 'x' | 'z' = rng() < 0.5 ? 'x' : 'z', hx = w / 2, hz = d / 2;
  const doorOff = (span: number): number => (rng() - 0.5) * Math.max(0, span - sp.doorW - 2);
  // 문은 마주 보는 두 변에 냅니다(앞뒤로 지나갈 수 있게).
  const dz = door === 'z' ? doorOff(w) : null, dx = door === 'x' ? doorOff(d) : null, H = heightOverride ?? sp.h, dw = sp.doorW, dh = sp.doorH;
  wallSide(map, tex, 'x', cz - hz, cx - hx, cx + hx, dz === null ? null : cx + dz, H, dw, dh);
  wallSide(map, tex, 'x', cz + hz, cx - hx, cx + hx, dz === null ? null : cx + dz + (rng() - 0.5) * 1.5, H, dw, dh);
  wallSide(map, tex, 'z', cx - hx, cz - hz, cz + hz, dx === null ? null : cz + dx, H, dw, dh);
  wallSide(map, tex, 'z', cx + hx, cz - hz, cz + hz, dx === null ? null : cz + dx + (rng() - 0.5) * 1.5, H, dw, dh);
  const b: Building = { x: cx, z: cz, w, d, tex, door, floor: Math.floor(rng() * 3), type, h: H, roof: sp.roof };
  map.buildings.push(b);
  // 고층 건물 지상 1층의 상부에 실내 천장을 둡니다. 보행과 AI 길찾기는
  // 낮은 충돌 박스만 보므로 통과하며, 위로 쏜 탄환은 정확히 차단됩니다.
  if (type === 'apartment' && H >= 9) {
    addBox(map, { x0: cx - hx + WALL_T / 2, x1: cx + hx - WALL_T / 2,
      z0: cz - hz + WALL_T / 2, z1: cz + hz - WALL_T / 2,
      y0: 3.05, y1: 3.25, kind: 'ceiling', tex });
  }
  // 실내 구성: 상자와 선반. 문이 없는 쪽 벽에 붙여 두어 출입구와 실내 통로를 막지 않게 합니다(봇 길찾기도 이 통로를 씁니다).
  const crate = (px: number, pz: number, sx: number, sz: number, h: number): void => { addBox(map, { x0: px - sx, x1: px + sx, z0: pz - sz, z1: pz + sz, y0: 0, y1: h, kind: 'crate', tex: 0 }); };
  const wallSideOf = (): 1 | -1 => (rng() < 0.5 ? -1 : 1);
  const n = (type === 'house' && w * d <= 70) ? 0 : pickInt(rng, sp.crates);
  for (let i = 0; i < n; i++) {
    const s = 0.7 + rng() * 0.5, side = wallSideOf();
    const px = door === 'z' ? cx + side * (hx - WALL_T - s - 0.1) : cx + (rng() - 0.5) * Math.max(0, w - 6);
    const pz = door === 'z' ? cz + (rng() - 0.5) * Math.max(0, d - 6) : cz + side * (hz - WALL_T - s - 0.1);
    crate(px, pz, s, s, 0.9 + rng() * 0.3);
  }
  if (type === 'shop') { // 진열 선반 두 줄(문이 없는 쪽 벽을 따라)
    for (const side of [-1, 1] as const) {
      if (door === 'z') crate(cx + side * (hx - 1.1), cz, 0.38, d * 0.27, 1.55); else crate(cx, cz + side * (hz - 1.1), w * 0.27, 0.38, 1.55);
    }
  }
  if (type === 'warehouse') { // 쌓아 둔 팔레트
    const side = wallSideOf(); if (door === 'z') crate(cx + side * (hx - 1.6), cz + (rng() - 0.5) * 2, 1.0, 1.0, 1.9); else crate(cx + (rng() - 0.5) * 2, cz + side * (hz - 1.6), 1.0, 1.0, 1.9);
  }
  return b;
}

type LootSpec = Omit<Loot, 'id' | 'x' | 'z' | 'taken'>;
interface LootRow { k: LootKind; w?: WeaponId; p?: PartId; l?: number; wt: number; hi?: number }
const LOOT_TABLE: LootRow[] = [
  { k: 'weapon', w: 'smg', wt: 12 }, { k: 'weapon', w: 'rifle', wt: 13, hi: 2 }, { k: 'weapon', w: 'shotgun', wt: 10 }, { k: 'weapon', w: 'sniper', wt: 5, hi: 2.4 }, { k: 'weapon', w: 'pistol', wt: 4, hi: 0.3 },
  { k: 'ammo', wt: 20 }, { k: 'bandage', wt: 16 }, { k: 'medkit', wt: 6, hi: 1.4 }, { k: 'armor', l: 1, wt: 7 }, { k: 'armor', l: 2, wt: 4, hi: 1.5 }, { k: 'armor', l: 3, wt: 1.2, hi: 3 },
  { k: 'attach', p: 'reddot', wt: 3.5 }, { k: 'attach', p: 'scope2', wt: 2.6 }, { k: 'attach', p: 'scope4', wt: 1.4, hi: 2.4 }, { k: 'attach', p: 'suppressor', wt: 3 }, { k: 'attach', p: 'comp', wt: 3 },
  { k: 'attach', p: 'grip', wt: 3.4 }, { k: 'attach', p: 'extmag', wt: 3.4, hi: 1.5 },
  { k: 'attach', p: 'holo', wt: 2.4 }, { k: 'attach', p: 'scope8', wt: 0.7, hi: 2.6 }, { k: 'attach', p: 'flash', wt: 2.6 }, { k: 'attach', p: 'angled', wt: 2.6 }, { k: 'attach', p: 'quickmag', wt: 2.6 }, { k: 'attach', p: 'extquick', wt: 1.2, hi: 2.2 },
  { k: 'attach', p: 'tactical', wt: 2 }, { k: 'attach', p: 'cheek', wt: 1.6 },
  { k: 'helmet', l: 1, wt: 5 }, { k: 'helmet', l: 2, wt: 3, hi: 1.6 }, { k: 'helmet', l: 3, wt: 1.2, hi: 3 },
  { k: 'boost', wt: 5 }, { k: 'grenade', wt: 6 },
];
function rollLoot(rng: () => number, tier: 0 | 1): LootSpec {
  const wt = (r: LootRow): number => r.wt * (tier ? r.hi ?? 1 : 1); let total = 0; for (const r of LOOT_TABLE) total += wt(r);
  let x = rng() * total; for (const r of LOOT_TABLE) { x -= wt(r); if (x <= 0) return { kind: r.k, weapon: r.k === 'weapon' ? r.w ?? WEAPON_IDS[0] : null, part: r.p ?? null, level: r.l ?? 0 }; }
  return { kind: 'ammo', weapon: null, part: null, level: 0 };
}

// ---------- 소품 배치 ----------
const VEH: Record<string, { w: number; d: number; h: number }> = { car: { w: 4.4, d: 1.9, h: 1.5 }, jeep: { w: 4.0, d: 1.9, h: 1.95 }, truck: { w: 5.4, d: 2.1, h: 2.05 }, van: { w: 5.0, d: 2.1, h: 2.3 }, bus: { w: 9.6, d: 2.6, h: 3.1 } };
const VEH_COLORS = [0xb83a32, 0x2f5d9a, 0xd9d4c6, 0x3d4a3a, 0xd8a229, 0x2e2e32, 0x7e8a93, 0x8a5a2b, 0x4f8a6b];
const BOX_COLORS = [0xb5412f, 0x2f6aa0, 0x3f7b4a, 0xd0a02c, 0x7c4a2d, 0x8a8f94];

/** 이 직사각형이 어떤 충돌 상자와도 겹치지 않는지(pad 만큼 여유). */
function freeRect(map: GameMap, x0: number, z0: number, x1: number, z1: number, pad: number): boolean {
  if (x0 < -map.half + 2 || x1 > map.half - 2 || z0 < -map.half + 2 || z1 > map.half - 2) return false;
  for (let cx = cellOf(x0 - pad); cx <= cellOf(x1 + pad); cx++) for (let cz = cellOf(z0 - pad); cz <= cellOf(z1 + pad); cz++) {
    const l = map.grid.get(key(cx, cz)); if (!l) continue;
    for (const i of l) { const b = map.boxes[i]; if (x1 + pad > b.x0 && x0 - pad < b.x1 && z1 + pad > b.z0 && z0 - pad < b.z1) return false; }
  }
  for (const bd of map.buildings) if (x1 + pad > bd.x - bd.w / 2 && x0 - pad < bd.x + bd.w / 2 && z1 + pad > bd.z - bd.d / 2 && z0 - pad < bd.z + bd.d / 2) return false;
  return true;
}
/** 단단한 물건이 건물 출입구 앞(문이 난 두 변 바깥 4.5m)을 막는지. 문이 막히면 안의 전리품을 못 줍습니다. */
function blocksDoor(map: GameMap, x0: number, z0: number, x1: number, z1: number): boolean {
  for (const b of map.buildings) {
    const hx = b.w / 2, hz = b.d / 2; if (x1 < b.x - hx - 6 || x0 > b.x + hx + 6 || z1 < b.z - hz - 6 || z0 > b.z + hz + 6) continue;
    const A = 4.5; // 출입구 앞 빈 띠
    if (b.door === 'z') { if (x1 > b.x - hx && x0 < b.x + hx && ((z1 > b.z + hz && z0 < b.z + hz + A) || (z0 < b.z - hz && z1 > b.z - hz - A))) return true; }
    else if (z1 > b.z - hz && z0 < b.z + hz && ((x1 > b.x + hx && x0 < b.x + hx + A) || (x0 < b.x - hx && x1 > b.x - hx - A))) return true;
  }
  return false;
}
function addProp(map: GameMap, p: Omit<Prop, 'jit' | 'wreck' | 'v' | 'c'> & Partial<Pick<Prop, 'jit' | 'wreck' | 'v' | 'c'>>, solid: { kind: BoxKind; h?: number } | null, pad = 0.4): Prop | null {
  const full: Prop = { jit: 0, wreck: false, v: 0, c: 0x888888, ...p }, along = Math.abs(Math.sin(full.ry)) < 0.5, hx = (along ? full.w : full.d) / 2, hz = (along ? full.d : full.w) / 2;
  if (!freeRect(map, full.x - hx, full.z - hz, full.x + hx, full.z + hz, pad)) return null;
  if (solid && blocksDoor(map, full.x - hx, full.z - hz, full.x + hx, full.z + hz)) return null;
  map.props.push(full);
  if (solid) { full.box = map.boxes.length; const y0 = full.kind === 'container' ? full.v * 2.6 : 0; addBox(map, { x0: full.x - hx, x1: full.x + hx, z0: full.z - hz, z1: full.z + hz, y0, y1: y0 + (solid.h ?? full.h), kind: solid.kind, tex: 0 }); }
  return full;
}
function vehicleAt(map: GameMap, rng: () => number, x: number, z: number, ryHint?: number): boolean {
  const r = rng() * 7.6, kind = r < 3.4 ? 'car' : r < 5.2 ? 'jeep' : r < 6.4 ? 'truck' : r < 7.2 ? 'van' : 'bus', v = VEH[kind];
  let ry = rng() < 0.5 ? 0 : Math.PI / 2, jit = (rng() - 0.5) * 0.3;
  if (ryHint !== undefined) { const a = ((ryHint % Math.PI) + Math.PI) % Math.PI; ry = a < Math.PI / 4 || a > Math.PI * 0.75 ? 0 : Math.PI / 2; const diff = a < Math.PI / 2 ? a : a - Math.PI; jit = Math.max(-0.35, Math.min(0.35, ry === 0 ? diff : diff - Math.PI / 2)); }
  return !!addProp(map, { kind: kind as PropKind, x, z, ry, jit, w: v.w, d: v.d, h: v.h, c: VEH_COLORS[Math.floor(rng() * VEH_COLORS.length)], wreck: rng() < 0.4, v: Math.floor(rng() * 3) }, { kind: 'vehicle', h: v.h });
}
function containerRow(map: GameMap, rng: () => number, x: number, z: number, count: number, ry: number): void {
  const step = 2.7, len = 6.1; let at = 0;
  for (let i = 0; i < count; i++) {
    const ox = ry === 0 ? at : 0, oz = ry === 0 ? 0 : at, color = BOX_COLORS[Math.floor(rng() * BOX_COLORS.length)];
    const a = addProp(map, { kind: 'container', x: x + ox, z: z + oz, ry, w: len, d: 2.45, h: 2.6, c: color, v: 0 }, { kind: 'container' }, 0.05);
    if (a && rng() < 0.45) addProp(map, { kind: 'container', x: x + ox, z: z + oz, ry, w: len, d: 2.45, h: 2.6, c: BOX_COLORS[Math.floor(rng() * BOX_COLORS.length)], v: 1 }, { kind: 'container' }, -0.2);
    at += step;
  }
}
/** 울타리 한 줄: 4m 마디마다 충돌 상자를 두고, 마디 사이에 gap 칸을 비웁니다. */
function fenceLine(map: GameMap, rng: () => number, x0: number, z0: number, x1: number, z1: number, style: number, gapAt: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0), segs = Math.max(1, Math.round(len / 4)), horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  for (let i = 0; i < segs; i++) {
    if (Math.abs(i - gapAt) <= 0 || (len > 20 && Math.abs(i - gapAt - segs / 2) < 0.6)) continue;
    const t = (i + 0.5) / segs, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, L = len / segs - 0.15;
    addProp(map, { kind: 'fence', x, z, ry: horiz ? 0 : Math.PI / 2, w: L, d: 0.18, h: 1.3, v: style, c: style === 0 ? 0x8a6a45 : 0x9aa0a4 }, { kind: 'fence', h: 1.3 }, 0.02);
  }
  void rng;
}

// ---------- 엄폐물 ----------
/** 엄폐물: 가슴 높이(1.0~1.3m)라 뒤에 웅크려 막고, 위로 머리를 내밀어 쏠 수 있습니다. 충돌과 총알 차단이 모두 됩니다. */
function coverPiece(map: GameMap, rng: () => number, x: number, z: number, kinds: PropKind[]): boolean {
  const kind = kinds[Math.floor(rng() * kinds.length)], ry = rng() < 0.5 ? 0 : Math.PI / 2, jit = (rng() - 0.5) * 0.4;
  switch (kind) {
    case 'barrier': return !!addProp(map, { kind, x, z, ry, jit, w: 3, d: 0.8, h: 1.05, c: 0xb4b2aa }, { kind: 'prop' }, 0.15);
    case 'ruin': return !!addProp(map, { kind, x, z, ry, jit: jit * 0.5, w: 3.6 + rng() * 2.4, d: 0.4, h: 1.5 + rng() * 0.7, c: 0x9b8f7f, v: Math.floor(rng() * 3) }, { kind: 'prop' }, 0.15);
    case 'stonewall': return !!addProp(map, { kind, x, z, ry, jit: 0, w: 4.4, d: 0.6, h: 1.1, c: 0x8d8a82 }, { kind: 'prop' }, 0.1);
    case 'stump': return !!addProp(map, { kind, x, z, ry, w: 0.9 + rng() * 0.5, d: 0.9, h: 0.55 + rng() * 0.3, c: 0x6a4d31 }, { kind: 'prop' }, 0.3);
    case 'log': return !!addProp(map, { kind, x, z, ry, jit, w: 4.2, d: 0.9, h: 0.9, c: 0x5b4126 }, { kind: 'prop' }, 0.2);
    case 'rubble': return !!addProp(map, { kind, x, z, ry, w: 2.6, d: 2.2, h: 1.0, c: 0x8f8a80 }, { kind: 'prop' }, 0.2);
    case 'pallet': return !!addProp(map, { kind, x, z, ry, w: 1.8, d: 1.4, h: 1.3, c: 0x9c7a4a }, { kind: 'prop' }, 0.2);
    case 'sandbag': return !!addProp(map, { kind, x, z, ry, jit: jit * 0.5, w: 2.4, d: 0.7, h: 1.1, c: 0xa89b72 }, { kind: 'prop' }, 0.15);
    default: return false;
  }
}
const COVER_BY: Record<string, PropKind[]> = {
  urban: ['barrier', 'barrier', 'ruin', 'rubble', 'pallet', 'sandbag'], industrial: ['barrier', 'barrier', 'pallet', 'pallet', 'rubble', 'sandbag'], military: ['sandbag', 'sandbag', 'barrier', 'barrier', 'rubble'],
  village: ['stonewall', 'stonewall', 'ruin', 'log', 'stump', 'rubble'], farm: ['stonewall', 'log', 'stump', 'pallet', 'ruin'], field: ['stump', 'log', 'rubble', 'stonewall', 'barrier', 'ruin'],
};
/** 엄폐물 한 무리: 가까이 놓인 서너 개가 서로를 엇갈려 막아 줍니다. */
function coverCluster(map: GameMap, rng: () => number, x: number, z: number, kinds: PropKind[], n: number): void {
  for (let i = 0, tries = 0; i < n && tries < n * 6; tries++) { const a = rng() * Math.PI * 2, r = 1.2 + rng() * 4.5; if (coverPiece(map, rng, x + Math.cos(a) * r, z + Math.sin(a) * r, kinds)) i++; }
}

// ---------- 마을 ----------
interface ThemeDef { cols: [number, number]; rows: number; lot: { w: number; d: number }; first: BuildingType; kinds: Array<[BuildingType, number]>; names: string[] }
const THEMES: Record<Theme, ThemeDef> = {
  village:    { cols: [3, 2], rows: 2, lot: { w: 17, d: 15 }, first: 'house',     kinds: [['house', 5], ['cabin', 2], ['garage', 1.4], ['shop', 1], ['church', 0.8]],                 names: ['안개촌', '돌고개', '새벽마을', '버드나무골'] },
  urban:      { cols: [3, 2], rows: 2, lot: { w: 18, d: 16 }, first: 'apartment', kinds: [['apartment', 4], ['shop', 3], ['house', 1.5], ['garage', 1.5], ['clinic', 1.2], ['diner', 1.4]],             names: ['중앙시가', '붉은거리', '서쪽 항구'] },
  industrial: { cols: [2, 2], rows: 2, lot: { w: 23, d: 17 }, first: 'warehouse', kinds: [['warehouse', 3.4], ['hangar', 1.4], ['garage', 2], ['tower', 1.2], ['silo', 1.2], ['shop', 1]],               names: ['철강단지', '용암공장', '회색 부두'] },
  farm:       { cols: [2, 2], rows: 2, lot: { w: 21, d: 16 }, first: 'barn',      kinds: [['barn', 2], ['house', 3], ['cabin', 3], ['garage', 1], ['silo', 1.4]],                     names: ['붉은농장', '밀밭', '풍차언덕'] },
  military:   { cols: [3, 2], rows: 2, lot: { w: 17, d: 14 }, first: 'bunker',    kinds: [['bunker', 4], ['tower', 2], ['garage', 1.5], ['cabin', 1.5]],               names: ['북부기지', '검은 요새', '레이더 고지'] },
};
const THEME_LIST = Object.keys(THEMES) as Theme[];
const pickKind = (rng: () => number, d: ThemeDef): BuildingType => { let t = 0; for (const [, w] of d.kinds) t += w; let x = rng() * t; for (const [k, w] of d.kinds) { x -= w; if (x <= 0) return k; } return d.first; };

function station(map: GameMap, rng: () => number, cx: number, cz: number): boolean {
  if (!freeRect(map, cx - 14, cz - 10, cx + 14, cz + 18, 0)) return false;
  const b = build(map, rng, 'station', cx, cz), hz = b.d / 2, pz = cz + hz + 7.5;
  addProp(map, { kind: 'canopy', x: cx, z: pz, ry: 0, w: 11, d: 6.4, h: 4.7, c: rng() < 0.5 ? 0xc9302c : 0x2f6aa0 }, null, -9);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(map, { x0: cx + sx * 4.9 - 0.25, x1: cx + sx * 4.9 + 0.25, z0: pz + sz * 2.6 - 0.25, z1: pz + sz * 2.6 + 0.25, y0: 0, y1: 4.7, kind: 'prop', tex: 0 });
  for (const sx of [-1, 1]) addProp(map, { kind: 'pump', x: cx + sx * 2.1, z: pz, ry: Math.PI / 2, w: 2.6, d: 0.7, h: 1.4, c: 0xd8d8d0 }, { kind: 'prop' }, -9);
  vehicleAt(map, rng, cx + 14, pz + 1, 0);
  return true;
}

function furnish(map: GameMap, rng: () => number, c: Compound, layoutHalf: { x: number; z: number }, built: Building[]): void {
  const around = (min: number, max: number): [number, number] => { const a = rng() * Math.PI * 2, r = min + rng() * (max - min); return [c.x + Math.cos(a) * r, c.z + Math.sin(a) * r]; };
  const th = c.theme;
  if (th === 'industrial' || th === 'military') {
    const rows = th === 'industrial' ? 2 : 1; for (let k = 0; k < rows; k++) { const [x, z] = around(8, c.r - 6); containerRow(map, rng, x, z, 2 + Math.floor(rng() * 3), rng() < 0.5 ? 0 : Math.PI / 2); }
    for (let k = 0; k < 3; k++) { const [bx, bz] = around(6, c.r - 4); for (let j = 0; j < 2 + Math.floor(rng() * 2); j++) addProp(map, { kind: 'barrel', x: bx + (rng() - 0.5) * 1.6, z: bz + (rng() - 0.5) * 1.6, ry: 0, w: 0.62, d: 0.62, h: 0.95, c: [0xb5412f, 0x2f6aa0, 0x3f7b4a, 0xd0a02c][Math.floor(rng() * 4)] }, { kind: 'prop' }, 0.3); }
    const [tx, tz] = around(10, Math.max(11, c.r - 7)); if (th === 'industrial') addProp(map, { kind: 'tank', x: tx, z: tz, ry: 0, w: 4, d: 4, h: 11, c: 0xb9bcbe }, null, 1);
    if (th === 'industrial') for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(map, { x0: tx + sx * 1.5 - 0.2, x1: tx + sx * 1.5 + 0.2, z0: tz + sz * 1.5 - 0.2, z1: tz + sz * 1.5 + 0.2, y0: 0, y1: 8, kind: 'prop', tex: 0 });
  }
  if (th === 'military') {
    for (let k = 0; k < 3; k++) { const [x, z] = around(8, c.r - 5); addProp(map, { kind: 'tent', x, z, ry: rng() < 0.5 ? 0 : Math.PI / 2, w: 5.2, d: 3.6, h: 2.5, c: 0x6a7048 }, { kind: 'prop' }, 0.8); }
    for (const b of built.slice(0, 3)) for (let k = 0; k < 3; k++) addProp(map, { kind: 'sandbag', x: b.x + (k - 1) * 2.4, z: b.z + b.d / 2 + 3.2, ry: 0, w: 2.2, d: 0.7, h: 1.1, c: 0xa89b72 }, { kind: 'prop' }, 0.2);
  }
  if (th === 'farm') {
    for (let k = 0; k < 5; k++) { const [x, z] = around(7, c.r - 4); addProp(map, { kind: 'hay', x, z, ry: rng() < 0.5 ? 0 : Math.PI / 2, w: 1.5, d: 1.4, h: 1.4, c: 0xc9b25a }, { kind: 'prop' }, 0.5); }
    const tx = c.x + layoutHalf.x + 2, tz = c.z - layoutHalf.z - 1; addProp(map, { kind: 'tank', x: tx, z: tz, ry: 0, w: 3.4, d: 3.4, h: 9, c: 0xa7aeb2 }, null, 0.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(map, { x0: tx + sx * 1.2 - 0.2, x1: tx + sx * 1.2 + 0.2, z0: tz + sz * 1.2 - 0.2, z1: tz + sz * 1.2 + 0.2, y0: 0, y1: 7, kind: 'prop', tex: 0 });
  }
  if (th === 'urban' && !c.downtown) for (const b of built) if (rng() < 0.8) addProp(map, { kind: 'dumpster', x: b.x + (rng() < 0.5 ? -1 : 1) * (b.w / 2 + 1.6), z: b.z + (rng() - 0.5) * b.d * 0.6, ry: Math.PI / 2, w: 2, d: 1.2, h: 1.25, c: 0x2f6f4b }, { kind: 'prop' }, 0.5);
  if (c.downtown) {
    // 도심 내부 중앙 도로의 교차로는 차량/엄폐물로 막지 않습니다.
    // 엄폐물과 주차 차량은 외곽의 코너에 배치해 이동과 AI 경로를 보장합니다.
    const edgeX = METROPOLIS.cols * METROPOLIS.lotW / 2 + 4;
    const edgeZ = METROPOLIS.rows * METROPOLIS.lotD / 2 + 4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      coverCluster(map, rng, c.x + sx * edgeX, c.z + sz * edgeZ, COVER_BY.urban, 2);
      vehicleAt(map, rng, c.x + sx * edgeX, c.z + sz * (edgeZ - 6));
    }
    return;
  }
  // 마을 곳곳의 엄폐물 무리
  for (let k = 0, tries = 0, want = 5 + Math.floor(rng() * 3); k < want && tries < 40; tries++) { const [x, z] = around(5, c.r - 2); const before = map.props.length; coverCluster(map, rng, x, z, COVER_BY[th], 3 + Math.floor(rng() * 2)); if (map.props.length > before) k++; }
  // 마을 입구 표지판과 주차 차량
  const cars = th === 'urban' ? 3 : th === 'military' ? 1 : 2 + Math.floor(rng() * 2);
  for (let k = 0, tries = 0; k < cars && tries < 20; tries++) { const [x, z] = around(c.r * 0.35, c.r - 3); if (vehicleAt(map, rng, x, z)) k++; }
  // 울타리: 농장·공업단지·군사 시설은 둘레에 두르고 문틈을 남깁니다
  if (th === 'farm' || th === 'industrial' || th === 'military') {
    const fx = layoutHalf.x + 5.5, fz = layoutHalf.z + 5.5, style = th === 'farm' ? 0 : 1, g = Math.floor(rng() * 5);
    fenceLine(map, rng, c.x - fx, c.z - fz, c.x + fx, c.z - fz, style, g); fenceLine(map, rng, c.x - fx, c.z + fz, c.x + fx, c.z + fz, style, g + 1);
    fenceLine(map, rng, c.x - fx, c.z - fz, c.x - fx, c.z + fz, style, g); fenceLine(map, rng, c.x + fx, c.z - fz, c.x + fx, c.z + fz, style, g + 1);
  }
}

/** 건물 안 전리품 수. 100명이 겨루는 솔로 지도는 1.6배로 늘립니다. */
function lootCount(rng: () => number, mode: Mode, range: [number, number]): number { const n = pickInt(rng, range); return mode === 'br' ? Math.floor(n * 1.6 + rng()) : n; }

/** 실내 선반·상자 안에 전리품이 묻히지 않도록 플레이어가 닿을 수 있는 자리만 선택합니다. */
function interiorLootSpot(map: GameMap, rng: () => number, b: Building): { x: number; z: number } | null {
  for (let i = 0; i < 18; i++) {
    // 벙커에는 벽 옆 상자가 좁은 사각 포켓을 만듭니다. 상자가 없더라도
    // 실제 출입 경로가 막힌 곳에 전리품이 생기지 않도록 문과 연결된 중앙 복도를 우선합니다.
    const corridorX = b.type === 'bunker' && b.door === 'z' ? Math.min(b.w - 2.4, 1.6) : b.w - 2.4;
    const corridorZ = b.type === 'bunker' && b.door === 'x' ? Math.min(b.d - 2.4, 1.6) : b.d - 2.4;
    const x = b.x + (rng() - 0.5) * corridorX, z = b.z + (rng() - 0.5) * corridorZ;
    if (!blockedAt(map, x, z, PLAYER.radius + 0.1)) return { x, z };
  }
  return !blockedAt(map, b.x, b.z, PLAYER.radius + 0.1) ? { x: b.x, z: b.z } : null;
}

export function generateMap(seed: number, mode: Mode): GameMap {
  const rng = makeRng(seed), half = MAP_HALF[mode];
  const map: GameMap = { seed, mode, half, boxes: [], buildings: [], trees: [], rocks: [], props: [], compounds: [], sites: [], roads: [], loot: [], spawns: [], grid: new Map(), terrain: emptyTerrain() };
  // 중앙 랜드마크: 배틀로열은 항상 (0, 0)에 고층 시가지를 둡니다.
  // 별도의 Compound로 관리해 도로 연결, 지형 비침범, 전리품 생성 규칙을 공유합니다.
  if (mode === 'br') map.compounds.push({ x: 0, z: 0, r: 0, theme: 'urban', name: '중앙 메트로폴리스', downtown: true });
  const towns = mode === 'br' ? 14 : 4, minGap = mode === 'br' ? 74 : 58;
  for (let tries = 0; map.compounds.length < towns && tries < 800; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.78, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (map.compounds.every((c, i) => Math.hypot(c.x - x, c.z - z) > (mode === 'br' && i === 0 ? 102 : minGap))) { map.compounds.push({ x, z, r: 0, theme: 'village', name: '' }); }
  }
  // 종류를 골고루: 처음 다섯 곳은 서로 다른 종류, 나머지는 무작위
  // 난수 비교자로 sort하면 브라우저의 정렬 구현마다 RNG 호출 횟수가 달라져
  // 온라인 이용자의 지형/전리품 맵이 불일치할 수 있습니다. 정해진 횟수의 Fisher–Yates 사용.
  const bag = [...THEME_LIST];
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  const used: Record<string, number> = {};
  map.compounds.forEach((c, i) => {
    if (mode === 'br' && i === 0) { used.urban = 1; return; }
    // 고정 중앙 도시를 제외한 첫 다섯 마을은 서로 다른 테마를 보장합니다.
    const ordinaryIndex = mode === 'br' ? i - 1 : i;
    c.theme = ordinaryIndex < bag.length ? bag[ordinaryIndex] : THEME_LIST[Math.floor(rng() * THEME_LIST.length)];
    const def = THEMES[c.theme], n = used[c.theme] ?? 0;
    used[c.theme] = n + 1; c.name = def.names[n % def.names.length];
  });
  for (const c of map.compounds) {
    const downtown = c.downtown === true;
    const def = THEMES[c.theme], cols = downtown ? METROPOLIS.cols : mode === 'br' ? def.cols[0] : 2, rows = downtown ? METROPOLIS.rows : def.rows;
    const lot = downtown ? { w: METROPOLIS.lotW, d: METROPOLIS.lotD } : def.lot;
    const n = downtown ? cols * rows : (mode === 'br' ? 4 : 2) + Math.floor(rng() * 3);
    const slots: Array<[number, number]> = []; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) slots.push([i, j]);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    let reach = 8; const built: Building[] = [];
    slots.slice(0, Math.min(n, slots.length)).forEach(([i, j], idx) => {
      // 고층동과 저층 상업동을 섞어 지붕선이 단조롭지 않게 만듭니다.
      const landmark = downtown && i === cols - 1 && j === rows - 1;
      const type = landmark ? 'apartment' : downtown ? (idx % 5 === 0 ? 'shop' : idx % 7 === 0 ? 'clinic' : 'apartment') : idx === 0 ? def.first : pickKind(rng, def);
      const sp = SPEC[type];
      // 도심의 무작위 위치 흔들림은 줄여서 보행로를 꾸준히 4m 이상 남깁니다.
      const jitter = downtown ? 0.8 : 2.5;
      const bx = c.x + (i - (cols - 1) / 2) * lot.w + (rng() - 0.5) * jitter, bz = c.z + (j - (rows - 1) / 2) * lot.d + (rng() - 0.5) * jitter;
      // 건물별 3~9층, 북동쪽 스카이라인 랜드마크는 12층. 모든 높이는 벽/탄환 충돌과 일치합니다.
      const towerHeight = downtown && type === 'apartment' ? (landmark ? 12 : 3 + Math.floor(rng() * 7)) * 3.2 : undefined;
      const b = build(map, rng, type, bx, bz, towerHeight); built.push(b);
      reach = Math.max(reach, Math.hypot(bx - c.x, bz - c.z) + Math.max(b.w, b.d) / 2);
      // 건물 안 전리품
      const loots = lootCount(rng, mode, sp.loot);
      for (let k = 0; k < loots; k++) { const at = interiorLootSpot(map, rng, b); if (at) pushLoot(map, rollLoot(rng, sp.tier), at.x, at.z); }
      // 문밖 상자
      if (!downtown && rng() < 0.55) { const s = 0.6 + rng() * 0.4, ox = b.x + (b.w / 2 + 1.6) * (rng() < 0.5 ? -1 : 1), oz = b.z + (rng() - 0.5) * b.d; if (freeRect(map, ox - s, oz - s, ox + s, oz + s, 0.3)) addBox(map, { x0: ox - s, x1: ox + s, z0: oz - s, z1: oz + s, y0: 0, y1: 1.1, kind: 'crate', tex: 0 }); }
    });
    c.r = reach + 6;
    furnish(map, rng, c, { x: (cols * lot.w) / 2, z: (rows * lot.d) / 2 }, built);
  }
  // 마을을 잇는 길: 가까운 두 마을씩
  const used2 = new Set<string>(), cs = map.compounds;
  for (let i = 0; i < cs.length; i++) {
    const near = cs.map((o, j) => ({ j, d: Math.hypot(o.x - cs[i].x, o.z - cs[i].z) })).filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { j } of near) { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (!used2.has(k)) { used2.add(k); map.roads.push(i < j ? [i, j] : [j, i]); } }
  }
  // 들판의 외딴 시설: 주유소·오두막·창고·초소·벙커
  const lone: BuildingType[] = mode === 'br' ? ['station', 'station', 'station', 'station', 'cabin', 'cabin', 'cabin', 'cabin', 'cabin', 'cabin', 'garage', 'garage', 'garage', 'tower', 'tower', 'tower', 'bunker', 'bunker', 'bunker', 'barn', 'barn', 'cabin', 'cabin', 'garage', 'church', 'church', 'diner', 'diner', 'diner', 'silo', 'silo', 'silo', 'hangar', 'hangar', 'clinic'] : ['station', 'cabin', 'cabin', 'tower', 'bunker', 'diner'];
  const farFromTown = (x: number, z: number, pad: number): boolean => map.compounds.every(c => Math.hypot(c.x - x, c.z - z) > c.r + pad) && map.sites.every(s => Math.hypot(s.x - x, s.z - z) > s.r + pad);
  for (const type of lone) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.82, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!farFromTown(x, z, 18)) continue;
      const before = map.buildings.length;
      if (type === 'station') { if (!station(map, rng, x, z)) continue; map.sites.push({ x, z: z + 5, r: 18 }); }
      else { if (!freeRect(map, x - 12, z - 10, x + 12, z + 10, 0)) continue; const b = build(map, rng, type, x, z); map.sites.push({ x, z, r: Math.max(b.w, b.d) / 2 + 6 }); }
      const b = map.buildings[before], sp = SPEC[b.type];
      for (let k = 0, n = lootCount(rng, mode, sp.loot); k < n; k++) {
        const at = interiorLootSpot(map, rng, b);
        if (at) pushLoot(map, rollLoot(rng, sp.tier), at.x, at.z);
      }
      if (type === 'bunker' || type === 'tower') for (let k = 0; k < 3; k++) addProp(map, { kind: 'sandbag', x: b.x + (k - 1) * 2.4, z: b.z + b.d / 2 + 3.2, ry: 0, w: 2.2, d: 0.7, h: 1.1, c: 0xa89b72 }, { kind: 'prop' }, 0.2);
      if (type === 'barn') for (let k = 0; k < 3; k++) addProp(map, { kind: 'hay', x: b.x + b.w / 2 + 3 + k * 1.8, z: b.z + (rng() - 0.5) * 4, ry: 0, w: 1.5, d: 1.4, h: 1.4, c: 0xc9b25a }, { kind: 'prop' }, 0.4);
      break;
    }
  }
  // 지형: 강·호수·늪·구릉·절벽·숲. 구릉과 절벽은 충돌 상자가 되고, 물은 걸음을 늦춥니다.
  map.terrain = planTerrain(seed, mode, half, map.compounds, map.sites, map.roads.map(([i, j]) => [cs[i], cs[j]] as [Compound, Compound]), map.boxes);
  buildTerrain(map, rng);
  const clear = (x: number, z: number, pad: number): boolean => farFromTown(x, z, pad) && waterDepth(map.terrain, x, z) === 0 && groundHeight(map.terrain, x, z) < 0.08;
  // 길가의 전봇대, 버려진 차량
  const dir = (a: Compound, b: Compound): number => Math.atan2(b.z - a.z, b.x - a.x);
  for (const [i, j] of map.roads) {
    const a = cs[i], b = cs[j], len = Math.hypot(b.x - a.x, b.z - a.z), ang = dir(a, b), nx = -Math.sin(ang), nz = Math.cos(ang);
    for (let d = a.r + 8; d < len - b.r - 6; d += 30) addProp(map, { kind: 'pole', x: a.x + Math.cos(ang) * d + nx * 3.6, z: a.z + Math.sin(ang) * d + nz * 3.6, ry: ang, w: 0.3, d: 0.3, h: 9, c: 0x6b5a45 }, { kind: 'prop' }, 0.2);
    if (rng() < (mode === 'br' ? 0.8 : 0.5)) { const t = 0.3 + rng() * 0.4; vehicleAt(map, rng, a.x + (b.x - a.x) * t + nx * (rng() - 0.5) * 2, a.z + (b.z - a.z) * t + nz * (rng() - 0.5) * 2, ang); }
  }
  for (let k = 0, tries = 0, want = mode === 'br' ? 14 : 3; k < want && tries < 80; tries++) { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.88; if (clear(Math.cos(a) * r, Math.sin(a) * r, 2) && vehicleAt(map, rng, Math.cos(a) * r, Math.sin(a) * r)) k++; }
  // 들판: 바위
  const rocks = mode === 'br' ? 60 : 22;
  for (let i = 0, tries = 0; i < rocks && tries < 800; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.94, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clear(x, z, 3)) continue;
    const sx = 1.2 + rng() * 2.2, sz = 1.2 + rng() * 2.2, sy = 0.9 + rng() * 1.5, hx = sx * 0.8, hz = sz * 0.8;
    // 충돌 판정 반경 2.2m보다 큰 바위는 주변 지형과 겹칠 수 있었습니다.
    // 실제 바위 AABB 전체를 확인해 언덕/절벽과의 겹침을 방지합니다.
    if (!freeRect(map, x - hx, z - hz, x + hx, z + hz, 0.15)) continue;
    map.rocks.push({ x, z, sx, sy, sz, ry: rng() * Math.PI }); addBox(map, { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y0: 0, y1: sy, kind: 'rock', tex: 0 }); i++;
  }
  // 나무: 무리 지어 심고 밑동만 충돌
  const groves = mode === 'br' ? 22 : 8;
  for (let g = 0; g < groves; g++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.9, gx = Math.cos(a) * r, gz = Math.sin(a) * r, pine = rng() < 0.45, count = 4 + Math.floor(rng() * 7);
    for (let i = 0; i < count; i++) {
      const x = gx + (rng() - 0.5) * 22, z = gz + (rng() - 0.5) * 22; if (Math.abs(x) > half || Math.abs(z) > half || !clear(x, z, 2) || blockedAt(map, x, z, 1.4)) continue;
      const s = 0.85 + rng() * 0.6; map.trees.push({ x, z, s, pine }); addBox(map, { x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: 7, kind: 'trunk', tex: 0 });
    }
  }
  // 들판의 엄폐물 무리: 허허벌판에서도 몸을 숨길 곳이 있게
  for (let k = 0, tries = 0, want = mode === 'br' ? 34 : 12; k < want && tries < want * 6; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.9, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clear(x, z, 3)) continue;
    const before = map.props.length; coverCluster(map, rng, x, z, COVER_BY.field, 3 + Math.floor(rng() * 3)); if (map.props.length > before) k++;
  }
  // 길목 검문소: 길 가운데에 장벽과 모래주머니
  for (const [i, j] of map.roads) if (rng() < 0.6) { const a = cs[i], b = cs[j], t = 0.35 + rng() * 0.3; coverCluster(map, rng, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, ['barrier', 'sandbag', 'barrier'], 3); }
  // 덤불: 몸을 숨길 수는 없지만 들판이 덜 휑해 보이게 하는 장식(충돌 없음)
  for (let i = 0, tries = 0, want = mode === 'br' ? 140 : 40; i < want && tries < want * 4; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.95, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clear(x, z, 1.5) || blockedAt(map, x, z, 1)) continue;
    map.props.push({ kind: 'bush', x, z, ry: rng() * 6.28, jit: 0, w: 1.2 + rng() * 0.9, d: 1, h: 0.8 + rng() * 0.5, c: [0x4c6a2b, 0x5d7a31, 0x44602a][Math.floor(rng() * 3)], v: 0, wreck: false }); i++;
  }
  // 들판 전리품
  const field = mode === 'br' ? 32 : 9;
  for (let i = 0, tries = 0; i < field && tries < 400; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.9, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clear(x, z, 1) || blockedAt(map, x, z, 0.6)) continue;
    pushLoot(map, rollLoot(rng, 0), x, z); i++;
  }
  // 차량 곁에도 가끔 전리품
  for (const p of map.props) {
    if (p.kind !== 'car' && p.kind !== 'van' && p.kind !== 'truck') continue;
    if (rng() >= 0.28) continue;
    const x = p.x + 2.6, z = p.z;
    // Roadside vehicles beside rivers can otherwise spill their loot into the water.
    if (waterDepth(map.terrain, x, z) !== 0 || blockedAt(map, x, z, 0.5)) continue;
    pushLoot(map, rollLoot(rng, 0), x, z);
  }
  // 출발 지점: 가장자리 쪽에 흩어 놓습니다. 대전은 서로 정반대에서 시작합니다.
  if (mode === 'duel') {
    const a = rng() * Math.PI * 2;
    // 처음 두 곳은 정반대(1대1), 나머지는 사이사이에 놓아 최대 8명이 서로 떨어져 시작합니다.
    for (const k of [0, 4, 2, 6, 1, 5, 3, 7]) spawnNear(map, rng, Math.cos(a + k * Math.PI / 4) * half * 0.72, Math.sin(a + k * Math.PI / 4) * half * 0.72);
  } else {
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2 + (rng() - 0.5) * 0.25, r = half * (0.42 + rng() * 0.45); spawnNear(map, rng, Math.cos(a) * r, Math.sin(a) * r); }
  }
  return map;
}

/** 구릉·절벽을 충돌 상자로 만들고 숲에 나무와 쓰러진 통나무를 심습니다. */
function buildTerrain(map: GameMap, rng: () => number): void {
  const t = map.terrain;
  for (const h of t.hills) { // 둥근 언덕을 십자 모양 상자 세 개로 근사합니다
    const c = h.r * 0.7, a = h.r * 0.94, b = h.r * 0.4;
    for (const [sx, sz] of [[c, c], [a, b], [b, a]] as const) addBox(map, { x0: h.x - sx, x1: h.x + sx, z0: h.z - sz, z1: h.z + sz, y0: 0, y1: h.h, kind: 'rock', tex: 0 });
  }
  for (const c of t.cliffs) addBox(map, { x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y0: 0, y1: c.h, kind: 'rock', tex: 0 });
  for (const f of t.forests) {
    const pine = rng() < 0.6, want = Math.floor((f.r * f.r) / (map.mode === 'br' ? 26 : 40));
    for (let i = 0, tries = 0; i < want && tries < want * 4; tries++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * f.r, x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
      if (Math.abs(x) > map.half - 2 || Math.abs(z) > map.half - 2 || waterDepth(t, x, z) || blockedAt(map, x, z, 1.5)) continue;
      map.trees.push({ x, z, s: 0.85 + rng() * 0.7, pine: rng() < 0.85 ? pine : !pine }); addBox(map, { x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: 7, kind: 'trunk', tex: 0 }); i++;
    }
    for (let i = 0, tries = 0; i < 3 && tries < 20; tries++) { const a = rng() * Math.PI * 2, r = rng() * f.r * 0.7; if (coverPiece(map, rng, f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, ['log', 'stump', 'log'])) i++; }
  }
  for (const p of t.ponds) if (p.swamp) for (let i = 0, tries = 0; i < 3 && tries < 30; tries++) { // 늪가의 통나무와 그루터기
    const a = rng() * Math.PI * 2, r = p.rx * (1.02 + rng() * 0.25); if (coverPiece(map, rng, p.x + Math.cos(a) * r, p.z + Math.sin(a) * r * (p.rz / p.rx), ['log', 'stump'])) i++;
  }
}

function pushLoot(map: GameMap, spec: LootSpec, x: number, z: number): void { map.loot.push({ ...spec, id: map.loot.length, x, z, taken: false }); }
function spawnNear(map: GameMap, rng: () => number, x: number, z: number): void {
  const safe = (px: number, pz: number): boolean =>
    Math.abs(px) < map.half - 1.2 && Math.abs(pz) < map.half - 1.2 &&
    !blockedAt(map, px, pz, 1.2) && waterDepth(map.terrain, px, pz) === 0;
  for (let i = 0; i < 40; i++) {
    const px = x + (rng() - 0.5) * 14 * (1 + i / 10), pz = z + (rng() - 0.5) * 14 * (1 + i / 10);
    if (safe(px, pz)) { map.spawns.push({ x: px, z: pz }); return; }
  }
  // 무작위 탐색이 모두 실패해도 최초 목표 좌표(물속/건물 속)에 억지로 스폰하지 않습니다.
  // 가까운 곳부터 결정적으로 탐색해 온라인 참가자도 같은 안전한 착지점을 사용합니다.
  for (let ring = 0; ring <= Math.ceil(map.half / 4); ring++) {
    const radius = ring * 4;
    for (let j = 0; j < 24; j++) {
      const a = j * (Math.PI * 2 / 24), px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      if (safe(px, pz)) { map.spawns.push({ x: px, z: pz }); return; }
    }
  }
  // 지형이 모두 막힌 비정상적인 지도는 조용히 잘못된 출발점을 만드는 대신 즉시 표시합니다.
  throw new Error('ZERO ZONE: unable to find a safe spawn position');
}


/** 이 원(반지름 r)이 서 있는 높이에서 막히는 상자와 겹치는지. */
export function blockedAt(map: GameMap, x: number, z: number, r: number): boolean {
  const standTop = groundHeight(map.terrain, x, z) + PLAYER.height - 0.3;
  for (let cx = cellOf(x - r); cx <= cellOf(x + r); cx++) for (let cz = cellOf(z - r); cz <= cellOf(z + r); cz++) {
    const l = map.grid.get(key(cx, cz)); if (!l) continue;
    for (const i of l) { const b = map.boxes[i]; if (b.y0 >= standTop) continue; if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true; }
  }
  return false;
}

/** 원(반지름 r)이 막히는 상자와 실제로 겹치는지(둥근 모서리 기준). */
export function circleHits(map: GameMap, x: number, z: number, r: number, clearance = PLAYER.height - 0.3): boolean {
  const standTop = groundHeight(map.terrain, x, z) + clearance;
  for (let cx = cellOf(x - r); cx <= cellOf(x + r); cx++) for (let cz = cellOf(z - r); cz <= cellOf(z + r); cz++) {
    const l = map.grid.get(key(cx, cz)); if (!l) continue;
    for (const i of l) {
      const b = map.boxes[i]; if (b.y0 >= standTop) continue;
      const dx = x - Math.max(b.x0, Math.min(x, b.x1)), dz = z - Math.max(b.z0, Math.min(z, b.z1)); if (dx * dx + dz * dz < r * r - 1e-6) return true;
    }
  }
  return false;
}

/** 투척물용 구-상자 충돌. 2D 보행 판정과 달리 고도(y)를 함께 검사합니다.
 * 높이 4m 이상으로 날아가는 수류탄이 낮은 벽에 걸리거나, 건물 천장을 통과하던 오류를 막습니다. */
export function sphereHits(map: GameMap, x: number, y: number, z: number, radius: number): boolean {
  const rr = radius * radius;
  for (let gx = cellOf(x - radius); gx <= cellOf(x + radius); gx++) {
    for (let gz = cellOf(z - radius); gz <= cellOf(z + radius); gz++) {
      const indices = map.grid.get(key(gx, gz));
      if (!indices) continue;
      for (const i of indices) {
        const b = map.boxes[i];
        if (y + radius < b.y0 || y - radius > b.y1) continue;
        const nearX = Math.max(b.x0, Math.min(b.x1, x));
        const nearY = Math.max(b.y0, Math.min(b.y1, y));
        const nearZ = Math.max(b.z0, Math.min(b.z1, z));
        const xx = x - nearX, yy = y - nearY, zz = z - nearZ;
        if (xx * xx + yy * yy + zz * zz < rr - 1e-8) return true;
      }
    }
  }
  return false;
}

/** 원을 (dx,dz) 만큼 옮기되 막히는 상자 속으로는 절대 들어가지 않습니다(작은 걸음으로 쪼개 벽을 따라 미끄러짐).
 *  좁은 틈이나 겹친 상자 사이에서 밀어내기만 하면 벽 반대편으로 튕겨 나가 벽을 뚫는 버그가 있어 이동은 이 함수를 씁니다. */
export function slideMove(map: GameMap, p: { x: number; z: number }, dx: number, dz: number, r: number): boolean {
  if (circleHits(map, p.x, p.z, r)) pushOut(map, p, r); // 이미 겹쳐 있으면(착지·출발) 먼저 빼냅니다
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5))), sx = dx / n, sz = dz / n; let hit = false;
  for (let i = 0; i < n; i++) {
    if (!circleHits(map, p.x + sx, p.z, r)) p.x += sx; else if (sx !== 0) hit = true;
    if (!circleHits(map, p.x, p.z + sz, r)) p.z += sz; else if (sz !== 0) hit = true;
  }
  return hit;
}

/** 원을 상자 밖으로 밀어냅니다. 결과는 out 에 돌려주고 벽에 닿았는지 반환합니다. */
export function pushOut(map: GameMap, p: { x: number; z: number }, r: number): boolean {
  const standTop = groundHeight(map.terrain, p.x, p.z) + PLAYER.height - 0.3;
  let hit = false;
  for (let iter = 0; iter < 6; iter++) for (let cx = cellOf(p.x - r); cx <= cellOf(p.x + r); cx++) for (let cz = cellOf(p.z - r); cz <= cellOf(p.z + r); cz++) {
    const l = map.grid.get(key(cx, cz)); if (!l) continue;
    for (const i of l) {
      const b = map.boxes[i]; if (b.y0 >= standTop) continue;
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

/** 광선이 통과하는 CELL 격자를 빠짐없이 순회합니다.
 * 이전 4m 샘플링은 셀 모서리의 짧은 통과 구간을 건너뛰어 얇은 벽을 뚫는 문제가 있었습니다.
 * DDA는 방문한 셀만 검사하므로 긴 시야/총알 광선의 빈 셀 탐색 비용도 낮춥니다. */
/** 슬랩 기반 3축 Ray/AABB 교차. 광선마다 상자별 클로저/배열을 만들지 않습니다. */
function rayBoxDistance(b: Box, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, limit: number): number {
  let near = 0, far = limit;
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.x0 || ox > b.x1) return Infinity;
  } else {
    let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx;
    if (a > c) { const temp = a; a = c; c = temp; }
    if (a > near) near = a;
    if (c < far) far = c;
    if (near > far) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.y0 || oy > b.y1) return Infinity;
  } else {
    let a = (b.y0 - oy) / dy, c = (b.y1 - oy) / dy;
    if (a > c) { const temp = a; a = c; c = temp; }
    if (a > near) near = a;
    if (c < far) far = c;
    if (near > far) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.z0 || oz > b.z1) return Infinity;
  } else {
    let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz;
    if (a > c) { const temp = a; a = c; c = temp; }
    if (a > near) near = a;
    if (c < far) far = c;
    if (near > far) return Infinity;
  }
  return near;
}

let rayMarks = new Uint32Array(1 << 14);
let rayStamp = 0;
export function rayWorld(map: GameMap, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, hit?: { boxIndex: number }): number {
  if (hit) hit.boxIndex = -1; // -1 = 지형 또는 장애물 없음
  if (!Number.isFinite(maxT) || maxT < 0 || !Number.isFinite(ox + oy + oz + dx + dy + dz)) return Infinity;
  // 커다란 지도나 미래의 추가 건물 때문에 상자가 16k개를 넘어가더라도 중복 인덱스 충돌이 없도록 합니다.
  if (map.boxes.length > rayMarks.length) {
    let size = rayMarks.length;
    while (size < map.boxes.length) size *= 2;
    rayMarks = new Uint32Array(size);
  }
  rayStamp = (rayStamp + 1) >>> 0;
  if (rayStamp === 0) { rayMarks.fill(0); rayStamp = 1; }
  let cx = cellOf(ox), cz = cellOf(oz), entry = 0, best = groundRayDistance(map.terrain, ox, oy, oz, dx, dy, dz, maxT);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
  const intervalX = stepX ? CELL / Math.abs(dx) : Infinity;
  const intervalZ = stepZ ? CELL / Math.abs(dz) : Infinity;
  let nextX = stepX ? ((cx + (stepX > 0 ? 1 : 0)) * CELL - ox) / dx : Infinity;
  let nextZ = stepZ ? ((cz + (stepZ > 0 ? 1 : 0)) * CELL - oz) / dz : Infinity;
  // 격자 경계 위에서 시작해 반대 방향으로 움직일 경우 0거리 첫 칸을 한 번 처리합니다.
  while (entry <= maxT && entry <= best) {
    // 격자선과 평행하게 달리는 광선은 경계의 양옆 AABB를 모두 만날 수 있습니다.
    const adjacentX = dx === 0 && Math.abs(ox - cx * CELL) < 1e-9 ? -1 : 0;
    const adjacentZ = dz === 0 && Math.abs(oz - cz * CELL) < 1e-9 ? -1 : 0;
    for (let ix = adjacentX; ix <= 0; ix++) for (let iz = adjacentZ; iz <= 0; iz++) {
      const indices = map.grid.get(key(cx + ix, cz + iz));
      if (!indices) continue;
      for (const i of indices) {
      if (rayMarks[i] === rayStamp) continue;
      rayMarks[i] = rayStamp;
      const t = rayBoxDistance(map.boxes[i], ox, oy, oz, dx, dy, dz, Math.min(maxT, best));
      if (t < best) {
        best = t;
        if (hit) hit.boxIndex = i;
      }
      }
    }
    const crossing = Math.min(nextX, nextZ);
    if (!Number.isFinite(crossing)) break;
    // 모서리를 정확히 통과할 때는 두 축을 동시에 넘습니다.
    if (nextX <= crossing) { nextX += intervalX; cx += stepX; }
    if (nextZ <= crossing) { nextZ += intervalZ; cz += stepZ; }
    entry = crossing;
  }
  return best;
}

/** 두 점 사이가 벽에 가려지지 않았는지(눈높이 기준 시선). */
export function lineClear(map: GameMap, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz); if (len < 1e-6) return true;
  return rayWorld(map, ax, ay, az, dx / len, dy / len, dz / len, len - 0.05) === Infinity;
}
