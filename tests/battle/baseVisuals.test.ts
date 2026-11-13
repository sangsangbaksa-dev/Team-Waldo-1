import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBaseDistrict } from '../../src/battle/baseVisuals';
import { createWar } from '../../src/battle/war';
import { getBaseState, placeBaseBuilding, relocateBaseBuilding } from '../../src/battle/base';

afterEach(() => { vi.unstubAllGlobals(); });

function beaconHeights(scene: THREE.Scene): number[] {
  return scene.getObjectByName('Constructed buildings')!.children.map(building =>
    building.getObjectByName('Construction beacon')!.position.y);
}

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

  it('animates equally across different render rates for the same elapsed time', () => {
    const slowScene = new THREE.Scene(), fastScene = new THREE.Scene();
    const slow = createBaseDistrict(slowScene, createWar());
    const fast = createBaseDistrict(fastScene, createWar());
    const initial = beaconHeights(slowScene);
    for (let frame = 0; frame < 30; frame++) slow.update(1 / 30);
    for (let frame = 0; frame < 120; frame++) fast.update(1 / 120);
    const slowHeights = beaconHeights(slowScene), fastHeights = beaconHeights(fastScene);
    expect(slowHeights).not.toEqual(initial);
    slowHeights.forEach((height, i) => expect(height).toBeCloseTo(fastHeights[i], 10));
    slow.dispose(); fast.dispose();
  });

  it.each([
    { state: 'paused', elapsed: 0, reducedMotion: false },
    { state: 'motion is reduced', elapsed: 1, reducedMotion: true },
  ])('keeps beacons still when $state while refreshing construction and relocation', ({ elapsed, reducedMotion }) => {
    const scene = new THREE.Scene(), war = createWar();
    const render = createBaseDistrict(scene, war);
    render.update(.5);
    const heights = beaconHeights(scene);
    render.update(elapsed, reducedMotion);
    expect(beaconHeights(scene)).toEqual(heights);

    war.factions[0].gold = 1000; war.factions[0].food = 1000;
    expect(placeBaseBuilding(war, 'barracks', 0)).toBe(true);
    render.update(elapsed, reducedMotion);
    expect(beaconHeights(scene).slice(0, heights.length)).toEqual(heights);
    expect(scene.getObjectByName('Building / barracks / slot 0')).toBeDefined();

    expect(relocateBaseBuilding(war, 0, 1)).toBe(true);
    render.update(elapsed, reducedMotion);
    expect(scene.getObjectByName('Building / barracks / slot 0')).toBeUndefined();
    expect(scene.getObjectByName('Building / barracks / slot 1')?.position.x).toBe(-9);
    expect(beaconHeights(scene).slice(0, heights.length)).toEqual(heights);

    render.update(.5, false);
    expect(beaconHeights(scene).slice(0, heights.length)).not.toEqual(heights);
    render.dispose();
  });

  it('follows OS reduced-motion changes without accumulating a jump while stopped', () => {
    const media = { matches: true };
    vi.stubGlobal('window', { matchMedia: () => media });
    const scene = new THREE.Scene(), referenceScene = new THREE.Scene();
    const render = createBaseDistrict(scene, createWar());
    const reference = createBaseDistrict(referenceScene, createWar());
    const initial = beaconHeights(scene);
    render.update(2);
    expect(beaconHeights(scene)).toEqual(initial);
    media.matches = false;
    render.update(.5); reference.update(.5);
    expect(beaconHeights(scene)).not.toEqual(initial);
    expect(beaconHeights(scene)).toEqual(beaconHeights(referenceScene));
    const animated = beaconHeights(scene);
    media.matches = true;
    render.update(2);
    expect(beaconHeights(scene)).toEqual(animated);
    render.dispose(); reference.dispose();
  });

  it('keeps the current pose without a positive finite elapsed time', () => {
    const scene = new THREE.Scene(), render = createBaseDistrict(scene, createWar());
    render.update(.5);
    const heights = beaconHeights(scene);
    render.update();
    for (const elapsed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) render.update(elapsed);
    expect(beaconHeights(scene)).toEqual(heights);
    render.dispose();
  });
});
