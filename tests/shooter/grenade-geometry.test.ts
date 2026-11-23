import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shooter/sim';
import { emptyTerrain } from '../../src/shooter/terrain';
import { addBox, sphereHits } from '../../src/shooter/world';

function field(): Match {
  const m = new Match({
    seed: 7, mode: 'duel', difficulty: 'normal',
    humans: [{ name: 'Tester' }], fill: 1,
  });
  const map = m.map;
  map.boxes = []; map.grid.clear(); map.terrain = emptyTerrain();
  m.nades.length = 0;
  return m;
}

function box(m: Match, x0: number, x1: number, y0: number, y1: number): void {
  addBox(m.map, { x0, x1, z0: -1, z1: 1, y0, y1, kind: 'wall', tex: 0 });
}

describe('ZERO ZONE grenade altitude collision', () => {
  it('detects overlap using all three axes (including elevated ceilings)', () => {
    const m = field();
    box(m, 5, 5.2, 0, 2.4);
    expect(sphereHits(m.map, 5.1, 1, 0, 0.15)).toBe(true);
    expect(sphereHits(m.map, 5.1, 3, 0, 0.15)).toBe(false);
    expect(sphereHits(m.map, 4, 1, 0, 0.15)).toBe(false);
    box(m, -1, 1, 3.05, 3.25);
    expect(sphereHits(m.map, 0, 3, 0, 0.15)).toBe(true);
    expect(sphereHits(m.map, 0, 2, 0, 0.15)).toBe(false);
  });

  it('bounces off a thin wall at eye level, but flies over it at a higher arc', () => {
    const low = field();
    box(low, 5, 5.2, 0, 2.4);
    low.nades.push({ id: 1, owner: 0, x: 4.4, y: 1.2, z: 0, vx: 12, vy: 0, vz: 0, fuse: 5 });
    low.step(0.1);
    expect(low.nades[0].vx).toBeLessThan(0);
    expect(low.nades[0].x).toBeLessThan(5);
    const high = field();
    box(high, 5, 5.2, 0, 2.4);
    high.nades.push({ id: 1, owner: 0, x: 4.4, y: 4, z: 0, vx: 12, vy: 0, vz: 0, fuse: 5 });
    high.step(0.1);
    expect(high.nades[0].vx).toBeGreaterThan(0);
    expect(high.nades[0].x).toBeGreaterThan(5.2);
  });

  it('does not tunnel through a thin overhead slab in a coarse simulation tick', () => {
    const m = field();
    box(m, -1, 1, 3, 3.2);
    m.nades.push({ id: 1, owner: 0, x: 0, y: 2.5, z: 0, vx: 0, vy: 12, vz: 0, fuse: 5 });
    m.step(0.1);
    expect(m.nades[0].y).toBeLessThan(3);
    expect(m.nades[0].vy).toBeLessThan(0);
  });
});
