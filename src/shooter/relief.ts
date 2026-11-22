import type { GameMap } from './world';

const smooth = (v: number): number => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const distance = (x: number, z: number, ax: number, az: number, bx: number, bz: number): number => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
};
const hash = (seed: number, x: number, z: number): number => {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const noise = (seed: number, x: number, z: number): number => {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(seed, ix, iz) * (1 - u) + hash(seed, ix + 1, iz) * u;
  const b = hash(seed, ix, iz + 1) * (1 - u) + hash(seed, ix + 1, iz + 1) * u;
  return (a * (1 - v) + b * v) * 2 - 1;
};

/** Visual-only terrain displacement; gameplay coordinates remain flat. */
export function groundHeight(seed: number, map: GameMap, x: number, z: number): number {
  let clearance = map.half - Math.max(Math.abs(x), Math.abs(z)) - 12;
  if (clearance <= 0) return 0;
  for (const c of map.compounds) clearance = Math.min(clearance, Math.hypot(x - c.x, z - c.z) - c.r - 12);
  for (const c of map.sites) clearance = Math.min(clearance, Math.hypot(x - c.x, z - c.z) - c.r - 12);
  if (clearance <= 0) return 0;
  for (const [i, j] of map.roads) { const a = map.compounds[i], b = map.compounds[j]; clearance = Math.min(clearance, distance(x, z, a.x, a.z, b.x, b.z) - 10); }
  for (const p of map.terrain.ponds) { const c = Math.cos(p.ry), s = Math.sin(p.ry), dx = x - p.x, dz = z - p.z; const q = Math.hypot((dx * c + dz * s) / p.rx, (-dx * s + dz * c) / p.rz); clearance = Math.min(clearance, (q - 1) * Math.min(p.rx, p.rz) - 12); }
  for (const river of map.terrain.rivers) for (let i = 0; i + 1 < river.pts.length; i++) clearance = Math.min(clearance, distance(x, z, ...river.pts[i], ...river.pts[i + 1]) - river.w / 2 - 12);
  for (const h of map.terrain.hills) clearance = Math.min(clearance, Math.hypot(x - h.x, z - h.z) - h.r - 12);
  for (const c of map.terrain.cliffs) clearance = Math.min(clearance, Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1)) - 12);
  for (const b of map.terrain.bridges) clearance = Math.min(clearance, Math.hypot(x - b.x, z - b.z) - b.len / 2 - 12);
  if (clearance <= 0) return 0;
  return 1.2 * smooth(clearance / 22) * (0.62 * noise(seed, x / 90, z / 90) + 0.26 * noise(seed + 1, x / 43, z / 43) + 0.12 * noise(seed + 2, x / 20, z / 20));
}
