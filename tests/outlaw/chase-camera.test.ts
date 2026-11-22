import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ChaseCamera } from '../../src/outlaw/camera';
import { generateCity } from '../../src/outlaw/world';

const target = { x: 100, y: 0, z: 100, yaw: 0, speed: 0 };
const look = { yaw: 0, pitch: 0 };
const opts = { aim: false, lookBack: false, air: false };

describe('OUTLAW chase-camera stability', () => {
  it('keeps camera and firing direction finite for invalid timestep and shake', () => {
    const camera = new THREE.PerspectiveCamera(), chase = new ChaseCamera(camera, generateCity(7));
    chase.reset(target, look);
    chase.shake(NaN);
    chase.update(NaN, 'foot', target, look, opts);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(chase.aimYaw)).toBe(true);
    expect(Number.isFinite(chase.aimPitch)).toBe(true);
    chase.update(0.016, 'car', { ...target, speed: 70 }, look, opts);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
  });
  it('allocates no temporary Vector3 clones in the steady-state camera frame', () => {
    const camera = new THREE.PerspectiveCamera(), chase = new ChaseCamera(camera, generateCity(8));
    chase.update(1/60, 'foot', target, look, opts);
    const spy = vi.spyOn(THREE.Vector3.prototype, 'clone');
    try {
      chase.update(1/60, 'foot', target, look, opts);
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
});
