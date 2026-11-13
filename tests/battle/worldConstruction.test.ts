// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBattleWorld, FACTION_COLORS } from '../../src/battle/graphics';
import { createWar } from '../../src/battle/war';

describe('complete WebGL battle-scene construction without a GPU', () => {
  it('creates a fully batched standard battlefield and disposes its assets', () => {
    expect(FACTION_COLORS).toEqual([0x50d9d1, 0xf06a77, 0xf5c45d, 0xaa8eed]);
    const scene = new THREE.Scene();
    const war = createWar({ difficulty: 'easy' });
    const world = createBattleWorld(scene, war);
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
    expect(scene.children.length).toBeGreaterThan(0);
    world.setQuality(false);
    world.setReducedMotion(true);
    expect(() => world.update(.025)).not.toThrow();
    expect(() => world.dispose()).not.toThrow();
    expect(scene.children).toHaveLength(0);
  });
});
