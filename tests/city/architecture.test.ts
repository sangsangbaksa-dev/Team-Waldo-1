import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Mesh } from '../../src/city/buildings';

describe('LAST CITY batched architectural geometry', () => {
  it('builds deterministic eight-sided rooftop silos with outward normals', () => {
    const m = new Mesh();
    m.pillar(10, 5, 20, 4, 40, new THREE.Color(0x8ea1af), 8);
    const g = m.geo();
    expect(g.getAttribute('position').count).toBe(32);
    expect(g.getIndex()?.count).toBe(48);
    const position = g.getAttribute('position') as THREE.BufferAttribute;
    const normals = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      expect([position.getX(i), position.getY(i), position.getZ(i), normals.getX(i), normals.getY(i), normals.getZ(i)].every(Number.isFinite)).toBe(true);
      expect(position.getY(i)).toBeGreaterThanOrEqual(5);
      expect(position.getY(i)).toBeLessThanOrEqual(40);
    }
    g.computeBoundingBox();
    expect(g.boundingBox?.min.x).toBeCloseTo(6);
    expect(g.boundingBox?.max.z).toBeCloseTo(24);
  });

  it('keeps facade relief and roof boxes in one indexable color mesh', () => {
    const m = new Mesh(), steel = new THREE.Color(0x566875);
    m.box(0, 0, 0, 10, 15, 10, steel);
    m.quad([[0, 1, 10], [10, 1, 10], [10, 14, 10], [0, 14, 10]], [0, 0, 1], steel);
    const g = m.geo();
    expect(g.getAttribute('position').count).toBe(24);
    expect(g.getIndex()?.count).toBe(36);
    expect(g.getAttribute('color').count).toBe(24);
  });
});
