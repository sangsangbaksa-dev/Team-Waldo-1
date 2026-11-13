import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBaseDistrict } from '../../src/battle/baseVisuals';
import { createWar } from '../../src/battle/war';
import { getBaseState, placeBaseBuilding } from '../../src/battle/base';

describe('detailed 3D construction district', () => {
  it('renders a command spire and individually identifiable starting buildings', () => {
    const scene = new THREE.Scene();
    const war = createWar();
    const district = createBaseDistrict(scene, war);
    const root = scene.getObjectByName('Player construction district')!;
    expect(root).toBeDefined();
    expect(root.getObjectByName('Central command spire')).toBeDefined();
    const structures = root.getObjectByName('Constructed buildings')!;
    expect(structures.children).toHaveLength(4);
    for (const item of getBaseState(war).structures) {
      const mesh = root.getObjectByName(`Building / ${item.kind} / slot ${item.slot}`);
      expect(mesh?.userData.slot).toBe(item.slot);
      const owner = war.factions[0], col = item.slot % 5, row = Math.floor(item.slot / 5);
      expect(district.slotAt(owner.x + 38 + (col - 2) * 9, owner.z - 2 + (row - 2) * 9))
        .toBe(item.slot);
    }
    expect(district.slotAt(Number.NaN, 0)).toBeNull();
    expect(district.slotAt(3000, 3000)).toBeNull();
    district.dispose();
    expect(scene.getObjectByName('Player construction district')).toBeUndefined();
  });

  it('refreshes visible buildings only on a changed blueprint without altering the economy', () => {
    const scene = new THREE.Scene(), war = createWar();
    const render = createBaseDistrict(scene, war);
    const structures = scene.getObjectByName('Constructed buildings')!;
    const before = structures.children.slice();
    render.update();
    expect(structures.children).toEqual(before);
    war.factions[0].gold = 1000; war.factions[0].food = 1000;
    expect(placeBaseBuilding(war, 'barracks', 0)).toBe(true);
    const gold = war.factions[0].gold, food = war.factions[0].food;
    render.update();
    expect(structures.children).toHaveLength(5);
    expect(structures.getObjectByName('Building / barracks / slot 0')).toBeDefined();
    expect(war.factions[0].gold).toBe(gold);
    expect(war.factions[0].food).toBe(food);
    const upgraded = structures.children.slice();
    render.update();
    expect(structures.children).toEqual(upgraded);
    render.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
