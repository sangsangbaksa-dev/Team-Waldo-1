// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createKingdomScenery } from '../../src/battle/kingdomScenery';
import { createWar } from '../../src/battle/war';

describe('inhabited medieval kingdoms', () => {
  it('builds four fortified capitals, town streets, farms and satellite villages as GPU batches', () => {
    const scene = new THREE.Group();
    const match = createWar({ grandBattle: true });
    createKingdomScenery(scene, match);
    const empire = scene.getObjectByName('Four medieval kingdoms — walled towns and satellite settlements');
    expect(empire).toBeDefined();
    const meshes = empire!.children.filter(child => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    expect(meshes.length).toBeGreaterThan(10);
    const visible = meshes.reduce((total, mesh) => total + mesh.count, 0);
    expect(visible).toBeGreaterThan(700);
    expect(meshes.some(mesh => mesh.count >= 150)).toBe(true);
    expect(meshes.every(mesh => mesh.count <= mesh.instanceMatrix.count)).toBe(true);
    const perTerritoryWalls = meshes.find(mesh => mesh.count === 32);
    expect(perTerritoryWalls).toBeDefined();
  });

  it('does not change the war state or initial 100-vs-500 troop count', () => {
    const game = createWar({grandBattle:true});
    const serialized = JSON.stringify(game);
    createKingdomScenery(new THREE.Group(),game);
    expect(JSON.stringify(game)).toBe(serialized);
    expect(game.units).toHaveLength(600);
  });
});
