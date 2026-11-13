import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGrandArmyVisuals } from '../../src/battle/grandArmyVisuals';
import { createWar } from '../../src/battle/war';

describe('large-army visual LOD', () => {
  it('keeps troop locomotion but suppresses decorative gait when reduced motion is enabled', () => {
    const war = createWar({ grandBattle: true }), parent = new THREE.Group();
    const visual = createGrandArmyVisuals(parent, war);
    const body = parent.children[0] as THREE.InstancedMesh;
    const infantry = war.units.find(unit => unit.owner === 0 && unit.kind === 'infantry')!;
    infantry.x += 1; war.time = .137;
    visual.update(true);
    const matrix = new THREE.Matrix4(); body.getMatrixAt(0, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(infantry.x);
    expect(position.y).toBeCloseTo(1.32);
    infantry.x += 1; war.time += .07;
    visual.update(false); body.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).y).toBeGreaterThan(1.32);
  });
  it('renders 600 warriors with shared instanced armor and complete cavalry legs', () => {
    const war = createWar({ grandBattle: true });
    const group = new THREE.Group();
    const visual = createGrandArmyVisuals(group, war);
    const batches = group.children.filter((object): object is THREE.InstancedMesh =>
      object instanceof THREE.InstancedMesh);
    expect(war.units).toHaveLength(600);
    expect(batches.length).toBeGreaterThan(80);
    expect(batches.every(mesh => mesh.count <= 400)).toBe(true);
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
});
