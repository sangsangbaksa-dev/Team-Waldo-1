import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PART_IDS, WEAPON_IDS } from './config';
import { makeDropCrate, makeFallbackGun, makePlane, partMesh } from './props';

describe('ZERO ZONE visual model fallbacks', () => {
  for (const id of WEAPON_IDS) {
    it(`creates a visible fallback for ${id}`, () => {
      const { group, tip } = makeFallbackGun(id);
      const bounds = new THREE.Box3().setFromObject(group);
      expect(bounds.isEmpty()).toBe(false);
      expect(tip.x).toBeGreaterThan(0);
      expect(tip.toArray().every(Number.isFinite)).toBe(true);
    });
  }
  for (const id of PART_IDS) {
    it(`creates a nonempty attachment fallback for ${id}`, () => {
      expect(new THREE.Box3().setFromObject(partMesh(id, 0.5)).isEmpty()).toBe(false);
    });
  }
  it('retains the independently animated supply parachute', () => {
    const crate = makeDropCrate();
    expect(crate.getObjectByName('chute')).toBeInstanceOf(THREE.Group);
    expect(new THREE.Box3().setFromObject(crate).isEmpty()).toBe(false);
  });
  it('creates a visible transport plane', () => {
    expect(new THREE.Box3().setFromObject(makePlane()).isEmpty()).toBe(false);
  });
});
