// ZERO ZONE — 지도 생성(건물·바위·나무·전리품)과 충돌·광선 검사. 화면과 무관한 순수 로직이라 시드가 같으면 어디서나 같은 지도가 나옵니다.
import { MAP_HALF, PLAYER, WEAPON_IDS, makeRng, type Mode, type WeaponId } from './config';

/** 위에서 본 직사각형 + 높이 범위. 벽·바위·상자·나무 기둥 모두 이 모양입니다. */
export interface Box { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; kind: 'wall' | 'rock' | 'crate' | 'trunk'; tex: number }
export interface Building { x: number; z: number; w: number; d: number; tex: number; door: 'x' | 'z'; floor: number }
export type LootKind = 'weapon' | 'ammo' | 'medkit' | 'armor';
export interface Loot { id: number; kind: LootKind; weapon: WeaponId | null; x: number; z: number; taken: boolean }
export interface Tree { x: number; z: number; s: number; pine: boolean }
export interface Rock { x: number; z: number; sx: number; sy: number; sz: number; ry: number }

export interface GameMap {
  seed: number; mode: Mode; half: number;
  boxes: Box[]; buildings: Building[]; trees: Tree[]; rocks: Rock[]; compounds: { x: number; z: number; r: number }[];
  loot: Loot[]; spawns: { x: number; z: number }[];
  /** 충돌·광선 검사용 격자. 칸 크기 CELL 미터. */
  grid: Map<number, number[]>;
}
export const CELL = 16;
const key = (cx: number, cz: number): number => (cx + 512) * 1024 + (cz + 512);
const cellOf = (v: number): number => Math.floor(v / CELL);

function addBox(map: GameMap, b: Box): void {
  const i = map.boxes.length; map.boxes.push(b);
  for (let cx = cellOf(b.x0); cx <= cellOf(b.x1); cx++) for (let cz = cellOf(b.z0); cz <= cellOf(b.z1); cz++) { const k = key(cx, cz); const l = map.grid.get(k); if (l) l.push(i); else map.grid.set(k, [i]); }
}

const WALL_T = 0.35, WALL_H = 3.2, DOOR_W = 2.5, DOOR_H = 2.45;

/** 한 변을 문틈을 남기고 세웁니다. along 은 변이 뻗는 축('x' 면 x 방향으로 긴 벽). */
function wallSide(map: GameMap, tex: number, along: 'x' | 'z', c: number, from: number, to: number, doorAt: number | null): void {
  const mk = (a: number, b: number, y0: number, y1: number): void => {
    if (b - a < 0.05) return;
    addBox(map, along === 'x' ? { x0: a, x1: b, z0: c - WALL_T / 2, z1: c + WALL_T / 2, y0, y1, kind: 'wall', tex } : { x0: c - WALL_T / 2, x1: c + WALL_T / 2, z0: a, z1: b, y0, y1, kind: 'wall', tex });
  };
  if (doorAt === null) { mk(from, to, 0, WALL_H); return; }
  const a = doorAt - DOOR_W / 2, b = doorAt + DOOR_W / 2;
  mk(from, a, 0, WALL_H); mk(b, to, 0, WALL_H); mk(a, b, DOOR_H, WALL_H);
}

function build(map: GameMap, rng: () => number, cx: number, cz: number, w: number, d: number, tex: number): Building {
  const door: 'x' | 'z' = rng() < 0.5 ? 'x' : 'z', hx = w / 2, hz = d / 2;
  const doorOff = (span: number): number => (rng() - 0.5) * (span - DOOR_W - 2);
  // 문은 마주 보는 두 변에 냅니다(앞뒤로 지나갈 수 있게).
  const dz = door === 'z' ? doorOff(w) : null, dx = door === 'x' ? doorOff(d) : null;
  wallSide(map, tex, 'x', cz - hz, cx - hx, cx + hx, dz === null ? null : cx + dz);
  wallSide(map, tex, 'x', cz + hz, cx - hx, cx + hx, dz === null ? null : cx + dz + (rng() - 0.5) * 1.5);
  wallSide(map, tex, 'z', cx - hx, cz - hz, cz + hz, dx === null ? null : cz + dx);
  wallSide(map, tex, 'z', cx + hx, cz - hz, cz + hz, dx === null ? null : cz + dx + (rng() - 0.5) * 1.5);
  const b: Building = { x: cx, z: cz, w, d, tex, door, floor: Math.floor(rng() * 3) };
  map.buildings.push(b);
  // 실내 엄폐물: 큰 건물에는 상자를 한두 개 둡니다.
  if (w * d > 70) for (let i = 0; i < 1 + (rng() < 0.5 ? 1 : 0); i++) {
    // 문이 없는 쪽 벽에 붙여 두어 출입구와 실내 통로를 막지 않게 합니다(봇 길찾기도 이 통로를 씁니다).
    const s = 0.7 + rng() * 0.5, side = rng() < 0.5 ? -1 : 1;
    const px = door === 'z' ? cx + side * (hx - WALL_T - s - 0.1) : cx + (rng() - 0.5) * Math.max(0, w - 6);
    const pz = door === 'z' ? cz + (rng() - 0.5) * Math.max(0, d - 6) : cz + side * (hz - WALL_T - s - 0.1);
    addBox(map, { x0: px - s, x1: px + s, z0: pz - s, z1: pz + s, y0: 0, y1: 0.9 + rng() * 0.3, kind: 'crate', tex: 0 });
  }
  return b;
}

const LOOT_WEIGHTS: Array<[LootKind, WeaponId | null, number]> = [
  ['weapon', 'smg', 13], ['weapon', 'rifle', 14], ['weapon', 'shotgun', 11], ['weapon', 'sniper', 5], ['weapon', 'pistol', 5],
  ['ammo', null, 22], ['medkit', null, 17], ['armor', null, 13],
];
const LOOT_TOTAL = LOOT_WEIGHTS.reduce((s, [, , w]) => s + w, 0);
function rollLoot(rng: () => number): [LootKind, WeaponId | null] {
  let r = rng() * LOOT_TOTAL; for (const [k, w, wt] of LOOT_WEIGHTS) { r -= wt; if (r <= 0) return [k, w]; }
  return ['ammo', null];
}

export function generateMap(seed: number, mode: Mode): GameMap {
  const rng = makeRng(seed), half = MAP_HALF[mode];
  const map: GameMap = { seed, mode, half, boxes: [], buildings: [], trees: [], rocks: [], compounds: [], loot: [], spawns: [], grid: new Map() };
  // 마을: 서로 충분히 떨어뜨려 배치
  const towns = mode === 'br' ? 10 : 4, minGap = mode === 'br' ? 78 : 56;
  for (let tries = 0; map.compounds.length < towns && tries < 600; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.78, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (map.compounds.every(c => Math.hypot(c.x - x, c.z - z) > minGap)) map.compounds.push({ x, z, r: 0 });
  }
  const mid = map.compounds.length;
  for (const c of map.compounds) {
    const cols = mode === 'br' ? 3 : 2, rows = 2, lot = { w: 17, d: 15 }, n = (mode === 'br' ? 3 : 2) + Math.floor(rng() * 3);
    const slots: Array<[number, number]> = []; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) slots.push([i, j]);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    let reach = 8;
    for (const [i, j] of slots.slice(0, Math.min(n, slots.length))) {
      const w = 8 + rng() * 5, d = 7 + rng() * 4, bx = c.x + (i - (cols - 1) / 2) * lot.w + (rng() - 0.5) * 2.5, bz = c.z + (j - (rows - 1) / 2) * lot.d + (rng() - 0.5) * 2.5;
      const b = build(map, rng, bx, bz, w, d, Math.floor(rng() * 4));
      reach = Math.max(reach, Math.hypot(bx - c.x, bz - c.z) + Math.max(w, d) / 2);
      // 건물 안 전리품 1~3개
      const loots = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < loots; k++) { const [kind, weapon] = rollLoot(rng); push(map, kind, weapon, b.x + (rng() - 0.5) * (b.w - 2.4), b.z + (rng() - 0.5) * (b.d - 2.4)); }
      // 문밖 상자와 소품
      if (rng() < 0.6) { const s = 0.6 + rng() * 0.4, ox = b.x + (b.w / 2 + 1.6) * (rng() < 0.5 ? -1 : 1), oz = b.z + (rng() - 0.5) * b.d; addBox(map, { x0: ox - s, x1: ox + s, z0: oz - s, z1: oz + s, y0: 0, y1: 1.1, kind: 'crate', tex: 0 }); }
    }
    c.r = reach + 6;
  }
  // 들판: 바위
  const clear = (x: number, z: number, pad: number): boolean => map.compounds.every(c => Math.hypot(c.x - x, c.z - z) > c.r + pad);
  const rocks = mode === 'br' ? 60 : 22;
  for (let i = 0, tries = 0; i < rocks && tries < 800; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.94, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clear(x, z, 3)) continue;
    const sx = 1.2 + rng() * 2.2, sz = 1.2 + rng() * 2.2, sy = 0.9 + rng() * 1.5;
    map.rocks.push({ x, z, sx, sy, sz, ry: rng() * Math.PI }); addBox(map, { x0: x - sx * 0.8, x1: x + sx * 0.8, z0: z - sz * 0.8, z1: z + sz * 0.8, y0: 0, y1: sy, kind: 'rock', tex: 0 }); i++;
  }
  // 나무: 무리 지어 심고 밑동만 충돌
  const groves = mode === 'br' ? 22 : 8;
  for (let g = 0; g < groves; g++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.9, gx = Math.cos(a) * r, gz = Math.sin(a) * r, pine = rng() < 0.45, count = 4 + Math.floor(rng() * 7);
    for (let i = 0; i < count; i++) {
      const x = gx + (rng() - 0.5) * 22, z = gz + (rng() - 0.5) * 22; if (Math.abs(x) > half || Math.abs(z) > half || !clear(x, z, 2)) continue;
      const s = 0.85 + rng() * 0.6; map.trees.push({ x, z, s, pine }); addBox(map, { x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: 0, y1: 7, kind: 'trunk', tex: 0 });
    }
  }
  // 들판 전리품
  const field = mode === 'br' ? 28 : 8;
  for (let i = 0, tries = 0; i < field && tries < 400; tries++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * half * 0.9, x = Math.cos(a) * r, z = Math.sin(a) * r; if (!clear(x, z, 1) || blockedAt(map, x, z, 0.6)) continue;
    const [kind, weapon] = rollLoot(rng); push(map, kind, weapon, x, z); i++;
  }
  // 출발 지점: 가장자리 쪽에 흩어 놓습니다. 대전은 서로 정반대에서 시작합니다.
  if (mode === 'duel') {
    const a = rng() * Math.PI * 2;
    for (const k of [0, 1]) spawnNear(map, rng, Math.cos(a + k * Math.PI) * half * 0.72, Math.sin(a + k * Math.PI) * half * 0.72);
  } else {
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2 + (rng() - 0.5) * 0.25, r = half * (0.42 + rng() * 0.45); spawnNear(map, rng, Math.cos(a) * r, Math.sin(a) * r); }
  }
  void mid;
  return map;
}

function push(map: GameMap, kind: LootKind, weapon: WeaponId | null, x: number, z: number): void {
  map.loot.push({ id: map.loot.length, kind, weapon: kind === 'weapon' ? weapon ?? WEAPON_IDS[0] : null, x, z, taken: false });
}
function spawnNear(map: GameMap, rng: () => number, x: number, z: number): void {
  for (let i = 0; i < 40; i++) {
    const px = x + (rng() - 0.5) * 14 * (1 + i / 10), pz = z + (rng() - 0.5) * 14 * (1 + i / 10);
    if (Math.abs(px) < map.half && Math.abs(pz) < map.half && !blockedAt(map, px, pz, 1.2)) { map.spawns.push({ x: px, z: pz }); return; }
  }
  map.spawns.push({ x, z });
}

const seen = new Int32Array(1 << 14); let stamp = 0;
/** 이 원(반지름 r)이 서 있는 높이에서 막히는 상자와 겹치는지. */
export function blockedAt(map: GameMap, x: number, z: number, r: number): boolean {
  for (let cx = cellOf(x - r); cx <= cellOf(x + r); cx++) for (let cz = cellOf(z - r); cz <= cellOf(z + r); cz++) {
    const l = map.grid.get(key(cx, cz)); if (!l) continue;
    for (const i of l) { const b = map.boxes[i]; if (b.y0 >= PLAYER.height - 0.3) continue; if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true; }
  }
  return false;
}

/** 원을 상자 밖으로 밀어냅니다. 결과는 out 에 돌려주고 벽에 닿았는지 반환합니다. */
export function pushOut(map: GameMap, p: { x: number; z: number }, r: number): boolean {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) for (let cx = cellOf(p.x - r); cx <= cellOf(p.x + r); cx++) for (let cz = cellOf(p.z - r); cz <= cellOf(p.z + r); cz++) {
    const l = map.grid.get(key(cx, cz)); if (!l) continue;
    for (const i of l) {
      const b = map.boxes[i]; if (b.y0 >= PLAYER.height - 0.3) continue;
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

/** 광선과 모든 상자의 첫 교차 거리(없으면 Infinity). dx,dy,dz 는 정규화된 방향. */
export function rayWorld(map: GameMap, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
  stamp++; let best = Infinity;
  const steps = Math.ceil(Math.min(maxT, best) / (CELL / 4));
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(maxT, s * (CELL / 4)), x = ox + dx * t, z = oz + dz * t;
    for (let cx = cellOf(x - 0.01); cx <= cellOf(x + 0.01); cx++) for (let cz = cellOf(z - 0.01); cz <= cellOf(z + 0.01); cz++) {
      const l = map.grid.get(key(cx, cz)); if (!l) continue;
      for (const i of l) {
        if (seen[i & 16383] === stamp) continue; seen[i & 16383] = stamp;
        const b = map.boxes[i]; let t0 = 0, t1 = Math.min(maxT, best);
        const slab = (o: number, d: number, lo: number, hi: number): boolean => {
          if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
          let a = (lo - o) / d, c = (hi - o) / d; if (a > c) { const tmp = a; a = c; c = tmp; }
          if (a > t0) t0 = a; if (c < t1) t1 = c; return t0 <= t1;
        };
        if (slab(ox, dx, b.x0, b.x1) && slab(oy, dy, b.y0, b.y1) && slab(oz, dz, b.z0, b.z1) && t0 < best) best = t0;
      }
    }
    if (t >= maxT || best <= t) break;
  }
  return best;
}

/** 두 점 사이가 벽에 가려지지 않았는지(눈높이 기준 시선). */
export function lineClear(map: GameMap, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz); if (len < 1e-6) return true;
  return rayWorld(map, ax, ay, az, dx / len, dy / len, dz / len, len - 0.05) === Infinity;
}
