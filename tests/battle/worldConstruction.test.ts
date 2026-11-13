// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBattleWorld } from '../../src/battle/graphics';
import { createWar } from '../../src/battle/war';
import { MAP_IDS } from '../../src/battle/maps';

describe('complete WebGL battle-scene construction without a GPU', () => {
  it.each(MAP_IDS.flatMap(mapId => [false, true].map(grandBattle => ({ mapId, grandBattle }))))('creates and releases $mapId with grandBattle=$grandBattle', ({ mapId, grandBattle }) => {
    const scene = new THREE.Scene();
    const war = createWar({ difficulty: 'easy', mapId, grandBattle });
    const world = createBattleWorld(scene, war);
    expect(scene.children.length).toBeGreaterThan(0);
    expect(() => world.update(.025)).not.toThrow();
    expect(() => world.dispose()).not.toThrow();
    expect(scene.children).toHaveLength(0);
  });
});
