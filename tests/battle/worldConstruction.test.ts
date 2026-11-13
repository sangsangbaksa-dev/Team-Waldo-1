// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBattleWorld } from '../../src/battle/graphics';
import { createWar } from '../../src/battle/war';

describe('complete WebGL battle-scene construction without a GPU', () => {
  it('creates a fully batched standard battlefield and disposes its assets', () => {
    const scene = new THREE.Scene();
    const war = createWar({ difficulty: 'easy' });
    const world = createBattleWorld(scene, war);
    expect(scene.children.length).toBeGreaterThan(0);
    expect(() => world.update(.025)).not.toThrow();
    expect(() => world.dispose()).not.toThrow();
  });
});
