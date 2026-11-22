import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { BUILDING_SHADOW_LAYER, buildBuildings } from '../../src/city/buildings';
import type { Solid } from '../../src/city/map';
import { World } from '../../src/city/world';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('batches static shadow casters by location and culls distant batches', () => {
  const draw = (): void => {};
  const gradient = (): { addColorStop: () => void } => ({ addColorStop: draw });
  const context = {
    createLinearGradient: gradient, createRadialGradient: gradient,
    fillRect: draw, strokeRect: draw, fillText: draw,
    beginPath: draw, moveTo: draw, lineTo: draw, fill: draw,
  };
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());

  const solid = (x: number): Solid => ({ x, y: 100, w: 100, h: 100, height: 0.3, wall: '#59606e', roof: '#8a93a3', struct: 0, alive: true });
  const w = new World({ seed: 123, difficulty: 'd4', klass: 'warlord' });
  w.map.solids = [solid(100), solid(300), solid(3600), { ...solid(1600), alive: false }, { ...solid(2400), struct: 1 }];
  w.businesses.length = 0;
  const scene = new THREE.Scene();
  buildBuildings(w, scene, '/');
  scene.updateMatrixWorld(true);

  const meshes = scene.children.filter(o => o instanceof THREE.Mesh);
  const casters = meshes.filter(o => o.castShadow);
  const buildings = meshes.filter(o => o.receiveShadow);
  expect(casters).toHaveLength(2);
  expect(buildings).toHaveLength(2);
  for (const [i, caster] of casters.entries()) {
    expect(caster.layers.isEnabled(BUILDING_SHADOW_LAYER)).toBe(true);
    expect(caster.layers.isEnabled(0)).toBe(false);
    expect(caster.geometry).toBe(buildings[i].geometry);
    expect(caster.geometry.hasAttribute('color')).toBe(true);
    expect(Array.isArray(caster.material)).toBe(false);
    expect(Array.isArray(buildings[i].material)).toBe(true);
  }

  const camera = new THREE.OrthographicCamera(-300, 300, 300, -300, 1, 2000);
  camera.position.set(200, 1000, 150);
  camera.up.set(0, 0, -1);
  camera.lookAt(200, 0, 150);
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  expect(casters.map(m => m.intersectsFrustum(frustum))).toEqual([true, false]);
});
