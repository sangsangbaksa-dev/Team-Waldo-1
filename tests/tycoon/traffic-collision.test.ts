import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Traffic } from '../../src/tycoon/scene/people';

describe('HUSTLE moving traffic collision', () => {
  it('uses initialized road coordinates and only considers visible cars', () => {
    const scene = new THREE.Scene();
    const traffic = new Traffic(scene, 'low');
    expect(traffic.group.children.some(car => car.visible)).toBe(false);
    traffic.setStage(6);
    const origin = new THREE.Vector3(0, 0, 0);
    traffic.update(1 / 60, origin, new THREE.Vector3(200, 0, 200), 0);
    const first = traffic.group.children.find(car => car.visible);
    expect(first).toBeDefined();
    if (first) {
      expect(traffic.blocks(first.position.x, first.position.z, 0.9)).toBe(true);
    }
    expect(traffic.blocks(9999, 9999, 0.9)).toBe(false);
    traffic.dispose();
    expect(traffic.group.parent).toBeNull();
  });
});
