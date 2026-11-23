import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WayfindingMarker } from '../../src/tycoon/scene/wayfinding';

describe('HUSTLE in-world waypoint', () => {
  it('stays hidden without a personal destination and avoids distant clutter', () => {
    const scene = new THREE.Scene(), guide = new WayfindingMarker(scene);
    const player = { x: 0, z: 0 };
    guide.update(1 / 60, player, null);
    expect(guide.group.visible).toBe(false);
    guide.update(1 / 60, player, { x: 250, z: 0 });
    expect(guide.group.visible).toBe(false);
    guide.update(1 / 60, player, { x: 30, z: 45 });
    expect(guide.group.visible).toBe(true);
    expect(guide.group.position.x).toBe(30);
    expect(guide.group.position.z).toBe(45);
    guide.update(1 / 60, { x: 29, z: 43 }, { x: 30, z: 45 });
    expect(guide.group.visible).toBe(false);
    guide.dispose();
  });
  it('reuses two meshes and releases their materials exactly once', () => {
    const scene = new THREE.Scene(), guide = new WayfindingMarker(scene);
    expect(guide.group.children).toHaveLength(2);
    let resources = 0;
    for (const child of guide.group.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.addEventListener('dispose', () => { resources++; });
      const mat = mesh.material as THREE.Material;
      mat.addEventListener('dispose', () => { resources++; });
    }
    guide.dispose();
    expect(scene.getObjectByName('HUSTLE wayfinding marker')).toBeUndefined();
    expect(resources).toBe(4);
    guide.dispose();
    expect(resources).toBe(4);
  });
});
