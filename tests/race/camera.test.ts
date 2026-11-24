import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOOST_FOV, BOOST_LAG, carEuler, chaseFov, chaseRoll, chaseRumble, chaseShake, chevronFacing, fovRate, impactResponse, stepChaseAnchor } from '../../src/race/camera';

describe('SPEED RUSH camera', () => {
  it('keeps positional shake tiny while nitro and speed still widen the FOV a lot', () => {
    expect(chaseShake(1, true, 0)).toBeLessThanOrEqual(0.03);
    expect(chaseShake(0, true, 0)).toBeLessThan(0.02); // 정지해서 니트로를 눌러도 화면이 떨리지 않음
    expect(chaseFov(1, true, 0) - chaseFov(1, false, 0)).toBe(BOOST_FOV);
    expect(BOOST_FOV).toBeGreaterThanOrEqual(8);
    expect(chaseFov(1, false, 0)).toBeGreaterThan(chaseFov(0.4, false, 0) + 10);
    expect(chaseFov(0, false, 1) - chaseFov(0, false, 0)).toBeGreaterThan(5);
    expect(impactResponse(3).kick).toBeCloseTo(0.15);
    expect(impactResponse(3).punch).toBe(0);
    expect(impactResponse(20).punch).toBeGreaterThan(0.2);
    expect(impactResponse(20).kick).toBeLessThanOrEqual(0.9);
    expect(impactResponse(-4).kick).toBe(0);
  });
  it('rumbles only a few thousandths of a radian and not at all when parked', () => {
    expect(chaseRumble(0, false, 0)).toBe(0);
    expect(chaseRumble(1, true, 0)).toBeGreaterThan(chaseRumble(1, false, 0));
    expect(chaseRumble(1, true, 1)).toBeLessThan(0.012);
    expect(fovRate(80, 70)).toBeGreaterThan(fovRate(70, 80)); // 확 터지고 천천히 풀림
  });
  it('lags the chase camera behind a nitro car without overshooting', () => {
    const fast = { x: 0, y: 2, z: 0, ready: false }, slow = { x: 0, y: 2, z: 0, ready: false };
    for (let i = 0; i < 120; i++) { const target = (i + 1) * (100 / 60); stepChaseAnchor(fast, target, 2, 0, 1 / 60, 1); stepChaseAnchor(slow, target, 2, 0, 1 / 60, 1, BOOST_LAG); expect(slow.x).toBeLessThanOrEqual(target + 1e-6); }
    expect(slow.x).toBeLessThan(fast.x - 0.8);
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
