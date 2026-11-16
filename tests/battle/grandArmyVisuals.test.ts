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

  it('keeps marching legs at rest when reduced motion is enabled while units still move', () => {
    const war = createWar({ grandBattle: true }), parent = new THREE.Group();
    const visual = createGrandArmyVisuals(parent, war);
    const infantry = war.units.find(u => u.owner === 0 && u.kind === 'infantry')!;
    const leg = parent.children.find((mesh): mesh is THREE.InstancedMesh => mesh instanceof THREE.InstancedMesh &&
      mesh.count > 0 && mesh.geometry instanceof THREE.BoxGeometry && mesh.geometry.parameters.width === .49)!;
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    visual.setReducedMotion(true);
    infantry.x += 3; war.time = 2; visual.update(); leg.getMatrixAt(0, matrix); position.setFromMatrixPosition(matrix);
    expect(position.y).toBeCloseTo(.42);
    expect(position.x).toBeCloseTo(infantry.x);
    visual.setReducedMotion(false);
    infantry.x += 3; war.time = 3; visual.update(); leg.getMatrixAt(0, matrix); position.setFromMatrixPosition(matrix);
    expect(position.y).toBeGreaterThan(.42);
  });
});
