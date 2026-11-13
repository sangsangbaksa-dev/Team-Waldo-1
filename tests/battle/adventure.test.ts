import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createAdventure } from '../../src/battle/adventure';
import { createWar } from '../../src/battle/war';

describe('hero parachute visibility', () => {
  it('keeps the canopy folded when entering or resuming strategic command', () => {
    const scene = new THREE.Scene();
    const adventure = createAdventure(scene, new THREE.PerspectiveCamera(), createWar({ grandBattle: true }), false);
    expect(scene.getObjectByName('hero-parachute')?.visible).toBe(false);
    adventure.update(0, new Set());
    expect(adventure.mode).toBe('strategy');
    expect(scene.getObjectByName('hero-parachute')?.visible).toBe(false);
    adventure.dispose();
  });
});
