// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createBattleWorld } from '../../src/battle/graphics';
import { createWar } from '../../src/battle/war';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('builds and releases the battlefield when media queries are unavailable', () => {
  vi.stubGlobal('matchMedia', undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  expect(window.matchMedia).toBeUndefined();
  const scene = new THREE.Scene();
  const world = createBattleWorld(scene, createWar({ grandBattle: true }));
  expect(scene.getObjectByName('Textured meadow terrain')).toBeDefined();
  world.setReducedMotion(true);
  world.dispose();
  expect(scene.children).toHaveLength(0);
});
