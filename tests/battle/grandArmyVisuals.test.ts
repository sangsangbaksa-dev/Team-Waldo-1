import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGrandArmyVisuals } from '../../src/battle/grandArmyVisuals';
import { createWar } from '../../src/battle/war';

describe('large-army visual LOD', () => {
  it('renders 600 warriors with shared instanced armor and complete cavalry legs', () => {
    const war = createWar({ grandBattle: true });
    const group = new THREE.Group();
    const visual = createGrandArmyVisuals(group, war);
    const batches = group.children.filter((object): object is THREE.InstancedMesh =>
      object instanceof THREE.InstancedMesh);
    expect(war.units).toHaveLength(600);
    expect(batches.length).toBeGreaterThan(80);
    expect(batches.every(mesh => mesh.count <= 400)).toBe(true);
    expect(group.getObjectByName('selected-squad-rings')).toHaveProperty('count', 100);
    const legBatches = batches.filter(mesh => mesh.geometry.type === 'BoxGeometry' &&
      (mesh.geometry as THREE.BoxGeometry).parameters.width === .36);
    // Four legs per mount, one instance group for each faction.
    expect(legBatches).toHaveLength(16);
    const horses = war.units.filter(u => u.kind === 'cavalry').length;
    expect(legBatches.reduce((sum, mesh) => sum + mesh.count, 0)).toBe(horses * 4);
    const meshes = group.children.slice();
    visual.update();
    expect(group.children).toEqual(meshes); // no per-frame geometry churn
  });

  it('updates instanced counts after combat losses without changing the simulation', () => {
    const war = createWar({ grandBattle: true });
    const parent = new THREE.Group(), visual = createGrandArmyVisuals(parent, war);
    const batches = parent.children.filter((obj): obj is THREE.InstancedMesh =>
      obj instanceof THREE.InstancedMesh);
    const before = batches.reduce((sum, mesh) => sum + mesh.count, 0);
    war.units.splice(0, 1);
    visual.update();
    const after = batches.reduce((sum, mesh) => sum + mesh.count, 0);
    expect(after).toBeLessThan(before);
    expect(war.units).toHaveLength(599);
  });

  it('highlights only the selected squad and shows health for wounded soldiers', () => {
    const war = createWar({ grandBattle: true }), parent = new THREE.Group();
    const visual = createGrandArmyVisuals(parent, war);
    war.units[0].squad = 1; war.units[0].hp /= 2;
    visual.setSelectedSquad(1);
    expect(parent.getObjectByName('selected-squad-rings')).toHaveProperty('count', 1);
    const health = parent.children.filter((object): object is THREE.InstancedMesh =>
      object instanceof THREE.InstancedMesh && object.name === 'army-health');
    expect(health.reduce((sum, mesh) => sum + mesh.count, 0)).toBe(1);
    visual.setOverlaysVisible(false);
    expect(parent.getObjectByName('selected-squad-rings')).toHaveProperty('count', 0);
    expect(health.reduce((sum, mesh) => sum + mesh.count, 0)).toBe(0);
  });

  it('honors reduced motion while continuing to turn and translate soldiers', () => {
    const war = createWar({ grandBattle: true }), parent = new THREE.Group();
    const visual = createGrandArmyVisuals(parent, war);
    visual.setReducedMotion(true);
    const leg = parent.children.find((object): object is THREE.InstancedMesh =>
      object instanceof THREE.InstancedMesh && object.geometry.type === 'BoxGeometry' &&
      (object.geometry as THREE.BoxGeometry).parameters.width === .49)!;
    const before = new THREE.Matrix4(), after = new THREE.Matrix4();
    leg.getMatrixAt(0, before);
    war.time = 1; war.units.find(unit => unit.owner === 0 && unit.kind === 'infantry')!.x += 2; visual.update();
    leg.getMatrixAt(0, after);
    expect(after.elements[13]).toBe(before.elements[13]);
    expect(after.elements[12]).not.toBe(before.elements[12]);
  });

});
