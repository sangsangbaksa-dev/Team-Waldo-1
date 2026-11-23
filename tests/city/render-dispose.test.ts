// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Renderer3D } from '../../src/city/render3d';

describe('LAST CITY 3D renderer teardown', () => {
  it('releases owned label textures and materials without touching model assets', () => {
    const ownedTexture = new THREE.Texture();
    const labelMat = new THREE.SpriteMaterial({ map: ownedTexture });
    const zoneTex = new THREE.Texture();
    const glowTex = new THREE.Texture();
    const fallbackMat = new THREE.MeshLambertMaterial();
    const sharedModelMat = new THREE.MeshStandardMaterial();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geo, sharedModelMat));
    const disposeOwned = [ownedTexture, labelMat, zoneTex, glowTex, fallbackMat, geo]
      .map(o => vi.spyOn(o, 'dispose'));
    const disposeShared = vi.spyOn(sharedModelMat, 'dispose');
    const details = { dispose: vi.fn() };
    const renderer = { dispose: vi.fn() };
    const ui = document.createElement('div');
    const fake = {
      post: null, ins: null, environment: null, details, renderer, scene,
      biz: new Map([[1, { label: { material: labelMat } }]]),
      zoneTex, glow: glowTex, mats: new Map([[1, fallbackMat]]),
      floaters: [{ el: ui, x: 0, y: 0, h: 0, life: 1 }],
    };
    Renderer3D.prototype.dispose.call(fake as unknown as Renderer3D);
    for (const spy of disposeOwned) expect(spy).toHaveBeenCalledTimes(1);
    expect(disposeShared).not.toHaveBeenCalled();
    expect(fake.biz.size).toBe(0);
    expect(fake.mats.size).toBe(0);
    expect(fake.floaters).toHaveLength(0);
    expect(details.dispose).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
