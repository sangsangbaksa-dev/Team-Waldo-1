import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { placeBaseBuilding } from '../../src/battle/base';
import { createBaseDistrict } from '../../src/battle/baseVisuals';
import { createWar } from '../../src/battle/war';

describe('physical 3D base entrances', () => {
  it('maps constructed world-space plots to an interior without opening empty land or the palace', () => {
    const war = createWar(), scene = new THREE.Scene();
    const district = createBaseDistrict(scene, war);
    const centerX = war.factions[0].x + 38, centerZ = war.factions[0].z - 2;
    const at = (slot: number) => ({
      x: centerX + (slot % 5 - 2) * 9,
      z: centerZ + (Math.floor(slot / 5) - 2) * 9,
    });
    expect(district.slotAt(at(6).x, at(6).z)).toBe(6);
    expect(district.slotAt(at(8).x, at(8).z)).toBe(8);
    expect(district.slotAt(at(12).x, at(12).z)).toBeNull();
    expect(district.slotAt(at(0).x, at(0).z)).toBeNull();
    expect(district.slotAt(at(6).x + 4.2, at(6).z)).toBeNull();
    expect(district.slotAt(Number.NaN, 0)).toBeNull();
    expect(placeBaseBuilding(war, 'farm', 0)).toBe(true);
    district.update();
    expect(district.slotAt(at(0).x, at(0).z)).toBe(0);
    expect(scene.children.some(object => object.name === 'Player construction district')).toBe(true);
    district.dispose();
    expect(scene.children.some(object => object.name === 'Player construction district')).toBe(false);
  });
});
