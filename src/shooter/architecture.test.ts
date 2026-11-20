import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFacadeTrim, buildRoofs } from './props';
import type { Box, Building, GameMap } from './world';

const wall = (x0: number, x1: number): Box => ({ x0, x1, z0: -0.175, z1: 0.175, y0: 0, y1: 3.2, kind: 'wall', tex: 0 });
const house: Building = { x: 0, z: 0, w: 10, d: 8, tex: 1, door: 'z', floor: 0, type: 'house', h: 3.2, roof: 'gable' };

function vertexCount(root: THREE.Object3D): number {
  let count = 0; root.traverse(o => { if (o instanceof THREE.Mesh) count += o.geometry.attributes.position.count; }); return count;
}

describe('ZERO ZONE architectural detail', () => {
  it('keeps decorative trim outside the doorway opening', () => {
    const boxes = [wall(-5, -1.25), wall(1.25, 5)];
    const map = { boxes } as GameMap, snapshot = JSON.stringify(boxes);
    const trim = buildFacadeTrim(map);
    expect(vertexCount(trim)).toBeGreaterThan(0);
    trim.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const position = o.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) expect(Math.abs(position.getX(i))).toBeGreaterThanOrEqual(1.249);
    });
    expect(JSON.stringify(boxes)).toBe(snapshot);
  });

  it('adds roof detail without editing the simulation map', () => {
    const map = { buildings: [house] } as GameMap, snapshot = JSON.stringify(map);
    const low = buildRoofs(map, () => 0.9, false), high = buildRoofs(map, () => 0.9, true);
    expect(vertexCount(high)).toBeGreaterThan(vertexCount(low));
    expect(JSON.stringify(map)).toBe(snapshot);
  });
});
