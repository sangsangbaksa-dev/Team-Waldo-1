import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createAdventure } from '../../src/battle/adventure';
import { createWar, MAP_HALF_SIZE } from '../../src/battle/war';

describe('direct exploration boundaries and tower entrances', () => {
  it('allows exploration throughout the expanded map and stops at its shoreline', () => {
    const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene();
    const adventure = createAdventure(scene, camera, createWar());
    adventure.toField();
    adventure.update(100, new Set(['w']));
    expect(camera.position.x).toBe(MAP_HALF_SIZE - 5);
    expect(camera.position.z).toBe(MAP_HALF_SIZE - 5);
    adventure.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('measures entry distance from the physical tower rather than the nearby flag', () => {
    const war = createWar(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const adventure = createAdventure(scene, camera, war);
    adventure.toField(); adventure.update(10, new Set(['w']));
    const post = war.outposts[0]; post.owner = 0;
    post.x = camera.position.x + 10; post.z = camera.position.z;
    expect(adventure.canEnterTower).toBe(false);
    expect(adventure.enterTower()).toBe(false);
    post.x = camera.position.x - 11.5;
    expect(adventure.canEnterTower).toBe(true);
    expect(adventure.enterTower()).toBe(true);
    adventure.update(0, new Set());
    expect(camera.position.x).toBeCloseTo(post.x + 11.5);
    expect(camera.position.y).toBe(11.9);
    adventure.dispose();
  });
});
