import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TracerPool } from './tracer-pool';

describe('ZERO ZONE bullet tracer GPU resources', () => {
  it('recycles the same geometry, mesh and material after a shot has faded', () => {
    const pool = new TracerPool();
    const first = pool.acquire(0xffd9a0), geometry = first.geometry, material = first.material;
    const disposeGeometry = vi.spyOn(geometry, 'dispose'), disposeMaterial = vi.spyOn(material, 'dispose');
    const scene = new THREE.Scene(); scene.add(first);
    first.material.opacity = 0.1;
    pool.release(first);
    expect(scene.children).not.toContain(first);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    const second = pool.acquire(0x8a8f96);
    expect(second).toBe(first);
    expect(second.geometry).toBe(geometry);
    expect(second.material).toBe(material);
    expect(second.material.color.getHex()).toBe(0x8a8f96);
    expect(second.material.opacity).toBe(0.9);
    expect(pool.allocated).toBe(1);
    pool.release(second);
    pool.dispose();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(pool.allocated).toBe(0);
  });
  it('keeps independent tracer fades while sharing one immutable geometry', () => {
    const pool = new TracerPool();
    const a = pool.acquire(0xfff0b8), b = pool.acquire(0xffd9a0);
    expect(a).not.toBe(b);
    expect(a.geometry).toBe(b.geometry);
    expect(a.material).not.toBe(b.material);
    a.material.opacity = 0.1;
    expect(b.material.opacity).toBe(0.9);
    pool.release(a);
    const c = pool.acquire(0x8a8f96);
    expect(c).toBe(a);
    expect(b.material.opacity).toBe(0.9);
    pool.dispose();
  });
});
