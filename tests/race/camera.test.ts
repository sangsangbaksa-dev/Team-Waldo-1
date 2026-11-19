import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOOST_FOV, carEuler, chaseFov, chaseRoll, chaseShake, chevronFacing, stepChaseAnchor } from '../../src/race/camera';

describe('SPEED RUSH camera', () => {
  it('does not shake the view for nitro and only widens FOV a little', () => {
    expect(chaseShake(1, true, 0)).toBeLessThanOrEqual(0.008);
    expect(chaseShake(1, true, 0)).toBe(chaseShake(1, false, 0));
    expect(chaseFov(1, true, 0) - chaseFov(1, false, 0)).toBe(BOOST_FOV);
    expect(BOOST_FOV).toBeLessThanOrEqual(4);
    expect(BOOST_FOV).toBeGreaterThan(0);
  });
  it('rolls the chase camera gently and mirrors left and right', () => {
    expect(chaseRoll(1, 0)).toBeCloseTo(-0.012);
    expect(chaseRoll(0, 1)).toBeCloseTo(-0.04);
    expect(chaseRoll(-1.5, -0.5)).toBeCloseTo(-chaseRoll(1.5, 0.5));
  });
  it('follows a fast car without feeding shake back into the anchor', () => {
    const anchor = { x: 0, y: 2, z: 0, ready: false };
    let prev = -1;
    for (let i = 0; i < 90; i++) {
      const target = (i + 1) * (80 / 60);
      stepChaseAnchor(anchor, target, 2, 0, 1 / 60, 1);
      expect(anchor.x).toBeLessThanOrEqual(target + 1e-6);
      expect(anchor.x).toBeGreaterThan(prev);
      prev = anchor.x;
    }
    expect(anchor.y).toBeCloseTo(2);
    expect(anchor.z).toBe(0);
  });
  it('keeps roll on the lean axis and pitch on the nose, for a car whose nose is +X', () => {
    const h = 0.4;
    const lean = carEuler(0.2, h, 0), nod = carEuler(0, h, 0.15);
    expect(lean.order).toBe('YXZ');
    expect(lean.x).toBeCloseTo(0.2); expect(lean.z).toBe(0); expect(lean.y).toBeCloseTo(-h);
    expect(nod.x).toBe(0); expect(nod.z).toBeCloseTo(0.15);
    const pose = (e: ReturnType<typeof carEuler>): { nose: THREE.Vector3; up: THREE.Vector3 } => {
      const o = new THREE.Object3D();
      o.rotation.set(e.x, e.y, e.z, e.order); o.updateMatrix();
      const m = o.matrix.elements;
      return { nose: new THREE.Vector3(m[0], m[1], m[2]), up: new THREE.Vector3(m[4], m[5], m[6]) };
    };
    const L = pose(lean), N = pose(nod);
    const fwd = new THREE.Vector3(Math.cos(h), 0, Math.sin(h)), right = new THREE.Vector3(-Math.sin(h), 0, Math.cos(h));
    expect(L.nose.dot(fwd)).toBeGreaterThan(0.99);
    expect(Math.abs(L.nose.y)).toBeLessThan(0.02);
    expect(Math.abs(L.up.dot(right))).toBeGreaterThan(0.15);
    expect(N.nose.y).toBeGreaterThan(0.1);
    expect(Math.abs(N.up.dot(right))).toBeLessThan(0.02);
  });
  it('faces chevrons toward the driver and mirrors them on left corners', () => {
    const right = chevronFacing(1, 0, 0.02), left = chevronFacing(1, 0, -0.02);
    expect(right.mirror).toBe(false); expect(left.mirror).toBe(true);
    expect(left.yaw).toBeCloseTo(right.yaw);
    const o = new THREE.Object3D();
    o.rotation.y = right.yaw; o.updateMatrix();
    const arrow = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
    expect(arrow.x).toBeCloseTo(0, 5); expect(arrow.z).toBeCloseTo(1, 5);
    expect(normal.x).toBeCloseTo(-1, 5); expect(normal.z).toBeCloseTo(0, 5);
  });
});
