import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addBox, type GameMap } from './world';
import { resolveChaseCamera } from './camera';
import { makeFallbackTree } from './vegetation';

function map(): GameMap { return { boxes: [], grid: new Map<number, number[]>() } as unknown as GameMap; }
const anchor = { x: 0, y: 1.7, z: 0 }, desired = { x: -6, y: 2.2, z: 0 };

describe('chase camera', () => {
  it('uses the requested position in empty space', () => {
    expect(resolveChaseCamera(map(), anchor, desired)).toEqual(desired);
  });
  it('stops in front of a solid wall', () => {
    const m = map(); addBox(m, { x0: -3, x1: -2.7, z0: -2, z1: 2, y0: 0, y1: 4, kind: 'wall', tex: 0 });
    const p = resolveChaseCamera(m, anchor, desired);
    expect(p.x).toBeGreaterThan(-2.7);
    expect(p.x).toBeLessThan(-2);
    expect(p.y).toBeGreaterThan(anchor.y);
  });
  it('detects a wall edge next to the center line', () => {
    const m = map(); addBox(m, { x0: -3, x1: -2.7, z0: 0.10, z1: 2, y0: 0, y1: 4, kind: 'wall', tex: 0 });
    expect(resolveChaseCamera(m, anchor, desired).x).toBeGreaterThan(-2.7);
  });
  it('handles a zero-length camera arm', () => {
    expect(resolveChaseCamera(map(), anchor, anchor)).toEqual(anchor);
  });
  it('never extends the arm when the anchor touches an obstacle', () => {
    const m = map(); addBox(m, { x0: -1, x1: 1, z0: -1, z1: 1, y0: 0, y1: 4, kind: 'wall', tex: 0 });
    expect(resolveChaseCamera(m, anchor, desired)).toEqual(anchor);
  });
});

describe('procedural foliage', () => {
  for (const pine of [false, true]) {
    it(`creates two batches and a finite silhouette for ${pine ? 'pine' : 'broadleaf'}`, () => {
      for (const low of [false, true]) {
        const batches = makeFallbackTree(pine, low);
        expect(batches).toHaveLength(2);
        const group = new THREE.Group();
        for (const [geo, mat] of batches) group.add(new THREE.Mesh(geo, mat));
        const b = new THREE.Box3().setFromObject(group);
        expect(b.max.y).toBeGreaterThan(6);
        expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
        expect([...b.min.toArray(), ...b.max.toArray()].every(Number.isFinite)).toBe(true);
      }
    });
    it(`reduces vertex count in low quality for ${pine ? 'pine' : 'broadleaf'}`, () => {
      const count = (low: boolean) => makeFallbackTree(pine, low).reduce((sum, [g]) => sum + g.attributes.position.count, 0);
      expect(count(true)).toBeLessThan(count(false));
    });
  }
});
