import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { makeRng } from './config';
import { tintGround } from './terrainview';
import { generateMap, type GameMap } from './world';

const smooth = (t: number): number => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
const TOWN = new THREE.Color(1.02, 0.97, 0.84), FOREST = new THREE.Color(0.58, 0.7, 0.46);
const MUD = new THREE.Color(0.66, 0.64, 0.4), SAND = new THREE.Color(1.22, 1.08, 0.82);
const ROCKY = new THREE.Color(0.9, 0.86, 0.76);

/** The original unoptimized ground-color math, kept as a visual reference. */
function originalTint(map: GameMap, x: number, z: number, c: THREE.Color): void {
  const t = map.terrain;
  for (const k of map.compounds) {
    const d = Math.hypot(x - k.x, z - k.z) - k.r;
    if (d < 26) c.lerp(TOWN, 0.55 * smooth(1 - Math.max(0, d) / 26));
  }
  for (const f of t.forests) {
    const d = Math.hypot(x - f.x, z - f.z) / f.r;
    if (d < 1.2) c.lerp(FOREST, 0.85 * smooth((1.2 - d) / 0.55));
  }
  for (const p of t.ponds) {
    const cs = Math.cos(p.ry), sn = Math.sin(p.ry);
    const dx = x - p.x, dz = z - p.z;
    const u = (dx * cs + dz * sn) / p.rx, v = (-dx * sn + dz * cs) / p.rz, q = Math.hypot(u, v);
    if (p.swamp) { if (q < 1.7) c.lerp(MUD, 0.8 * smooth((1.7 - q) / 0.8)); }
    else if (q < 1.35) c.lerp(SAND, 0.75 * smooth((1.35 - q) / 0.35));
  }
  for (const r of t.rivers) {
    let e = Infinity;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      e = Math.min(e, Math.hypot(x - ax - dx * t, z - az - dz * t) - r.w / 2);
    }
    if (e < 14) c.lerp(SAND, 0.7 * smooth(1 - Math.max(0, e) / 14));
  }
  for (const h of t.hills) {
    const d = Math.hypot(x - h.x, z - h.z) / h.r;
    if (d < 1.5) c.lerp(ROCKY, 0.7 * smooth((1.5 - d) / 0.6));
  }
  for (const w of t.cliffs) {
    const d = Math.max(Math.abs(x - (w.x0 + w.x1) / 2) - (w.x1 - w.x0) / 2,
      Math.abs(z - (w.z0 + w.z1) / 2) - (w.z1 - w.z0) / 2);
    if (d < 9) c.lerp(ROCKY, 0.75 * smooth(1 - Math.max(0, d) / 9));
  }
}

describe('ZERO ZONE ground tint optimized range checks', () => {
  it('keeps the original colors across randomized terrain samples and feature centers', () => {
    for (const seed of [42, 1234]) {
      const map = generateMap(seed, 'br'), rng = makeRng(seed + 9);
      const sample: Array<[number, number]> = [];
      for (let i = 0; i < 200; i++) {
        sample.push([(rng() * 2 - 1) * (map.half + 450), (rng() * 2 - 1) * (map.half + 450)]);
      }
      for (const c of map.compounds) sample.push([c.x, c.z], [c.x + c.r + 24, c.z]);
      for (const p of map.terrain.ponds) sample.push([p.x, p.z], [p.x + p.rx, p.z]);
      for (const f of map.terrain.forests) sample.push([f.x, f.z]);
      for (const r of map.terrain.rivers) if (r.pts.length) sample.push(r.pts[0]);
      for (const h of map.terrain.hills) sample.push([h.x, h.z]);
      for (const w of map.terrain.cliffs) sample.push([(w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2]);
      for (const [x, z] of sample) {
        const initial = new THREE.Color(0.86, 0.79, 0.61), expected = initial.clone(), actual = initial.clone();
        originalTint(map, x, z, expected);
        tintGround(map, x, z, actual);
        expect(actual.r).toBeCloseTo(expected.r, 12);
        expect(actual.g).toBeCloseTo(expected.g, 12);
        expect(actual.b).toBeCloseTo(expected.b, 12);
      }
    }
  });
  it('skips all far-away hypot work without changing the base color', () => {
    const map = generateMap(9, 'duel');
    const base = new THREE.Color(0.7, 0.9, 0.8), actual = base.clone();
    const hypot = vi.spyOn(Math, 'hypot');
    try {
      tintGround(map, 100000, -100000, actual);
      expect(hypot).not.toHaveBeenCalled();
      expect(actual.equals(base)).toBe(true);
    } finally {
      hypot.mockRestore();
    }
  });
});
