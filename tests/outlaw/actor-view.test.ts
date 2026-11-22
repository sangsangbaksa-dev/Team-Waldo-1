import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Sim } from '../../src/outlaw/sim';
import { ActorView } from '../../src/outlaw/actorview';

describe('OUTLAW vehicle view lifecycle', () => {
  it('replaces only a repainted car view while preserving the simulation vehicle', () => {
    const sim = new Sim(7);
    const v = sim.spawnVehicle('sedan', sim.player.x + 4, sim.player.z, 0, { color: 0xaabbcc });
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    camera.position.set(v.x, 2, v.z + 12); camera.updateMatrixWorld(true);
    const view = new ActorView(scene, sim, null, 'low');
    view.update(.016, camera, 14);
    const original = scene.getObjectByName(`vehicle-${v.id}`);
    expect(original).toBeDefined();
    view.update(.016, camera, 14);
    expect(scene.getObjectByName(`vehicle-${v.id}`)).toBe(original);
    v.color = 0x2f80ed;
    view.update(.016, camera, 14);
    const replacement = scene.getObjectByName(`vehicle-${v.id}`);
    expect(replacement).toBeDefined(); expect(replacement).not.toBe(original);
    const paint: number[] = [];
    replacement!.traverse(o => { if (o instanceof THREE.Mesh) {
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if ('color' in mat && mat.color instanceof THREE.Color) paint.push(mat.color.getHex());
      }
    } });
    expect(paint).toContain(v.color);
    expect(original!.parent).toBeNull();
    expect(sim.vehicle(v.id)).toBe(v);
    view.dispose();
  });
});
