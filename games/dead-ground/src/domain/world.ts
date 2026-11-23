import { clamp, lerp, randomSource, segmentBox, vec, type Vec3 } from './math.js';

export const HALF_MAP = 512;
export const TERRAIN_STEP = 4;
const GRID = HALF_MAP * 2 / TERRAIN_STEP + 1;
const BUCKET = 28;

export type CoverKind = 'concrete' | 'rock' | 'sandbag' | 'wreck' | 'tree' | 'plate' | 'brick';
export interface Cover {
  kind: CoverKind;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  yaw: number; variant: number;
}

export interface World {
  heightAt(x: number, z: number): number;
  canStand(x: number, z: number, height: number): boolean;
  trace(a: Vec3, b: Vec3): number;
  readonly cover: readonly Cover[];
  readonly spawns: readonly Vec3[];
}

export const LANDMARKS = [
  { name: 'THE FOUNDRY', x: 4, z: -40 },
  { name: 'BLACK RIDGE', x: -126, z: -62 },
  { name: 'RELAY STATION', x: 130, z: -143 },
  { name: 'SUNKEN ROAD', x: 89, z: 74 },
  { name: 'SOUTH TRENCH', x: -53, z: 163 },
  { name: 'THE QUARRY', x: -208, z: 118 },
  { name: 'EAST OUTPOST', x: 214, z: 100 },
] as const;

const CRATERS = [
  [-57, -20, 29, 6], [57, 36, 36, 8], [-18, 90, 16, 3.5],
  [65, -103, 25, 5], [-170, 22, 37, 9], [150, 145, 27, 6],
  [-216, 116, 45, 12], [215, -41, 19, 4], [-80, -171, 15, 3.4],
  [42, 214, 32, 6], [193, -211, 32, 7], [-287, -133, 44, 11],
  [308, 155, 39, 8], [102, 308, 30, 5], [-38, -276, 28, 6],
] as const;

function gaussian(x: number, z: number, cx: number, cz: number, sx: number, sz: number): number {
  return Math.exp(-(((x - cx) / sx) ** 2) - ((z - cz) / sz) ** 2);
}

function trench(x: number, z: number, center: number, z0: number, amplitude: number): number {
  const along = (x - center) / 112;
  if (Math.abs(along) >= 1) return 0;
  const lane = z0 + Math.sin(x * 0.032) * amplitude + Math.sin(x * 0.11) * 3;
  const offset = Math.abs(z - lane);
  const taper = Math.min(1, (1 - Math.abs(along)) * 5);
  return taper * (0.6 * Math.exp(-(((offset - 8) / 3) ** 2)) - 3.4 * Math.exp(-((offset / 5) ** 4)));
}

function sculpt(x: number, z: number): number {
  let y = Math.sin(x * 0.016 + z * 0.009) * 3.6 + Math.cos(z * 0.021 - x * 0.007) * 3.2
    + Math.sin(x * 0.044 - z * 0.023) * 1.05 + Math.cos(x * 0.09 + z * 0.061) * 0.37
    + Math.sin(x * 0.13 + z * 0.17) * 0.25;
  y += 27 * gaussian(x, z, -145, -55, 58, 123)
    + 31 * gaussian(x, z, 129, -149, 86, 66)
    + 18 * gaussian(x, z, 183, 106, 78, 77)
    + 14 * gaussian(x, z, -49, 165, 89, 63)
    - 6 * gaussian(x, z, 61, 122, 45, 104)
    + 52 * gaussian(x, z, -351, -249, 105, 151)
    + 63 * gaussian(x, z, 352, -226, 105, 145)
    + 56 * gaussian(x, z, -373, 219, 113, 138)
    + 44 * gaussian(x, z, 328, 277, 98, 147);
  for (const [cx, cz, radius, depth] of CRATERS) {
    if (Math.abs(x - cx) > radius * 1.5 || Math.abs(z - cz) > radius * 1.5) continue;
    const r = Math.hypot(x - cx, z - cz) / radius;
    y += depth * (0.26 * Math.exp(-(((r - 0.96) / 0.19) ** 2)) - Math.exp(-((r / 0.72) ** 4)));
  }
  y += trench(x, z, -33, 149, 12) + trench(x, z, -56, -112, 13) + trench(x, z, 172, 28, 14);
  const road = 83 + Math.sin(z * 0.009) * 32;
  y -= 2.1 * Math.exp(-(((x - road) / 8) ** 2));
  const foundry = clamp((1 - Math.hypot((x - 4) / 51, (z + 40) / 41)) * 3, 0, 1);
  return lerp(y, 1, foundry);
}

function local(point: Vec3, cover: Cover): Vec3 {
  const x = point.x - cover.x, z = point.z - cover.z;
  const c = Math.cos(cover.yaw), s = Math.sin(cover.yaw);
  return vec(x * c - z * s, point.y - cover.y, x * s + z * c);
}

export function createWorld(): World {
  const elevations = new Float32Array(GRID * GRID);
  for (let iz = 0; iz < GRID; iz++) {
    for (let ix = 0; ix < GRID; ix++) {
      elevations[iz * GRID + ix] = sculpt(ix * TERRAIN_STEP - HALF_MAP, iz * TERRAIN_STEP - HALF_MAP);
    }
  }

  function heightAt(x: number, z: number): number {
    const gx = clamp((x + HALF_MAP) / TERRAIN_STEP, 0, GRID - 1);
    const gz = clamp((z + HALF_MAP) / TERRAIN_STEP, 0, GRID - 1);
    const ix = Math.min(Math.floor(gx), GRID - 2), iz = Math.min(Math.floor(gz), GRID - 2);
    const dx = gx - ix, dz = gz - iz, i = iz * GRID + ix;
    const a = elevations[i], b = elevations[i + 1], c = elevations[i + GRID], d = elevations[i + GRID + 1];
    if (dx + dz <= 1) return a + (b - a) * dx + (c - a) * dz;
    return d + (c - d) * (1 - dx) + (b - d) * (1 - dz);
  }

  const spawns = [
    [-13, 141], [113, -136], [-125, -49], [141, 94], [-93, -94],
    [-108, 111], [158, -31], [62, 137], [6, -113], [-43, 46],
    [196, 105], [-183, 46],
  ].map(([x, z]) => vec(x, heightAt(x, z), z));

  const cover: Cover[] = [];
  const buckets = new Map<string, Cover[]>();
  const rng = randomSource(701961);

  function add(kind: CoverKind, x: number, z: number, w: number, h: number, d: number, yaw = 0, base = heightAt(x, z) - 0.2): void {
    const item = { kind, x, y: base + h / 2, z, w, h, d, yaw, variant: rng() };
    cover.push(item);
    const pad = Math.hypot(w, d) / 2 + 0.45;
    for (let bx = Math.floor((x - pad) / BUCKET); bx <= Math.floor((x + pad) / BUCKET); bx++) {
      for (let bz = Math.floor((z - pad) / BUCKET); bz <= Math.floor((z + pad) / BUCKET); bz++) {
        const key = `${bx},${bz}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(item);
        buckets.set(key, bucket);
      }
    }
  }

  function ruin(x: number, z: number, w: number, d: number, yaw: number, tall: number): void {
    const bottom = heightAt(x, z) - 1.1;
    const place = (kind: CoverKind, lx: number, lz: number, width: number, height: number, depth: number) =>
      add(kind, x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
        width, height, depth, yaw, bottom);
    place('concrete', 0, -d / 2, w, tall, 0.9);
    place('concrete', -w / 2, 0, 0.85, tall - 0.3, d);
    place('concrete', w / 2, -d * 0.23, 0.9, tall * 0.85, d * 0.55);
    place('brick', -w * 0.34, d / 2, w * 0.32, tall * 0.62, 0.84);
    place('brick', w * 0.35, d / 2, w * 0.3, tall * 0.86, 0.84);
    place('plate', -w * 0.35, -d * 0.27, w * 0.35, 0.33, d * 0.55);
  }

  ruin(-11, -41, 18, 12, 0.18, 7.4);
  ruin(12, -51, 19, 11, 0.18, 9.0);
  ruin(19, -30, 13, 11, -0.12, 5.1);
  ruin(122, -159, 13, 10, 0.48, 6.2);
  ruin(-135, -69, 15, 9, -0.29, 4.9);
  ruin(194, 115, 11, 8, 0.51, 4.4);
  ruin(-65, 119, 12, 9, -0.29, 4.5);
  ruin(-199, 95, 14, 10, 0.43, 5.0);
  ruin(71, 22, 11, 8, 0.6, 4.2);
  ruin(28, -207, 15, 11, 0.3, 6.5);

  for (const [x, z, yaw] of [[-26, 131, 0.2], [-13, 149, 0.16], [-101, -103, -0.28], [-117, -56, 0.52],
    [108, -145, -0.3], [133, -135, 0.65], [147, 89, -0.4], [7, -17, 0.26], [1, -100, 0.1], [64, 128, 0.32],
    [-60, 51, 0.22], [154, -39, -0.46], [-182, 55, 0.83], [201, 101, 0.45]]) {
    add('sandbag', x, z, 7.2, 1.48, 1.08, yaw);
    add('sandbag', x - 3.4, z + 1.7, 3.7, 1.33, 1.04, yaw + 1.4);
  }

  for (const [x, z, yaw] of [[10, -11, 0.65], [95, 78, 0.24], [115, 152, -0.43],
    [-61, 32, 0.94], [83, -117, 1.1], [-161, 66, 0.6], [178, 88, 0.15], [-179, -95, -0.4]]) {
    add('wreck', x, z, 3.25, 2, 5.8, yaw);
  }

  for (let i = 0; i < 630; i++) {
    const span = i < 375 ? 250 : 496;
    const x = (rng() * 2 - 1) * span, z = (rng() * 2 - 1) * span;
    if (spawns.some(spawn => Math.hypot(spawn.x - x, spawn.z - z) < 4)
      || (Math.abs(x - 4) < 31 && Math.abs(z + 40) < 28)) continue;
    const size = 0.45 + rng() ** 2 * 5.8;
    if (i % 4 === 0) {
      const trunk = 0.27 + rng() * 0.45;
      add('tree', x, z, trunk, 3.5 + rng() * 6.5, trunk, rng() * Math.PI * 2);
    } else {
      add('rock', x, z, size, size * (0.47 + rng() * 0.37), size * (0.6 + rng() * 0.55), rng() * Math.PI);
    }
  }

  function canStand(x: number, z: number, height: number): boolean {
    const ground = heightAt(x, z);
    const nearby = buckets.get(`${Math.floor(x / BUCKET)},${Math.floor(z / BUCKET)}`) ?? [];
    return nearby.every(item => {
      if (item.y + item.h / 2 <= ground + 0.30 || item.y - item.h / 2 >= ground + height) return true;
      const p = local(vec(x, ground, z), item);
      return Math.abs(p.x) > item.w / 2 + 0.33 || Math.abs(p.z) > item.d / 2 + 0.33;
    });
  }

  function trace(a: Vec3, b: Vec3): number {
    let stop = Infinity;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / 1.75));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (lerp(a.y, b.y, t) > heightAt(lerp(a.x, b.x, t), lerp(a.z, b.z, t))) continue;
      let lo = Math.max(0, (i - 1) / steps), hi = t;
      for (let j = 0; j < 6; j++) {
        const mid = (lo + hi) / 2;
        if (lerp(a.y, b.y, mid) <= heightAt(lerp(a.x, b.x, mid), lerp(a.z, b.z, mid))) hi = mid;
        else lo = mid;
      }
      stop = hi;
      break;
    }

    const checks = Math.max(1, Math.ceil(length / (BUCKET * 0.7)));
    const seen = new Set<Cover>();
    for (let i = 0; i <= checks; i++) {
      const t = Math.min(i / checks, stop);
      const bx = Math.floor(lerp(a.x, b.x, t) / BUCKET);
      const bz = Math.floor(lerp(a.z, b.z, t) / BUCKET);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const item of buckets.get(`${bx + dx},${bz + dz}`) ?? []) {
            if (seen.has(item)) continue;
            seen.add(item);
            const max = vec(item.w / 2, item.h / 2, item.d / 2);
            stop = Math.min(stop, segmentBox(local(a, item), local(b, item), vec(-max.x, -max.y, -max.z), max));
          }
        }
      }
      if (t >= stop) break;
    }
    return stop;
  }
  return { heightAt, canStand, trace, cover, spawns };
}
