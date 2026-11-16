import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createAdventure } from '../../src/battle/adventure';
import { createWar } from '../../src/battle/war';

describe('direct exploration without an intro', () => {
  it('starts at the home kingdom and permits exploration and return immediately', () => {
    const scene = new THREE.Scene();
    const adventure = createAdventure(scene, new THREE.PerspectiveCamera(), createWar({ grandBattle: true }));
    expect(adventure.mode).toBe('strategy');
    expect(scene.getObjectByName('hero-parachute')).toBeUndefined();
    adventure.toField();
    expect(adventure.isActionMode).toBe(true);
    expect(adventure.canEnterTower).toBe(true);
    expect(adventure.enterTower()).toBe(true);
    adventure.toStrategy();
    expect(adventure.isActionMode).toBe(false);
    adventure.dispose();
  });
});
