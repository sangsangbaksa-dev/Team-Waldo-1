import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ShooterView } from './view';
import { TracerPool } from './tracer-pool';
import type { Match } from './sim';

function viewFor(): ShooterView {
  // Logic-only renderer fixture: no browser/WebGL context required.
  const view = Object.create(ShooterView.prototype) as ShooterView;
  Object.assign(view, {
    match: { nades: [], loot: [] } as unknown as Match,
    scene: new THREE.Scene(), time: 0, quality: 'standard',
    liveNadeIds: new Set<number>(), liveLootIds: new Set<number>(),
    nadeMeshes: new Map(), booms: [], lootNodes: new Map(),
    pendingLootUpgrades: new Set(), beamStamps: [], lootDummy: new THREE.Object3D(),
    beams: new THREE.InstancedMesh(new THREE.CylinderGeometry(1), new THREE.MeshBasicMaterial(), 1),
    tracers: [], tracerPool: new TracerPool(),
    tracerDir: new THREE.Vector3(), tracerUp: new THREE.Vector3(0, 1, 0),
  });
  return view;
}

describe('ZERO ZONE render-loop scratch memory', () => {
  it('reuses grenade ID sets and disposes expired GPU render objects once', () => {
    const view = viewFor();
    const ids = view['liveNadeIds'];
    const grenade = { id: 13, x: 3, y: 1, z: -2, fuse: 1.5 };
    view.match.nades.push(grenade as Match['nades'][number]);
    view['updateNades'](1 / 60);
    const mesh = view['nadeMeshes'].get(13)!;
    const freeGeo = vi.spyOn(mesh.geometry, 'dispose'), freeMat = vi.spyOn(mesh.material, 'dispose');
    view['updateNades'](1 / 60);
    expect(view['nadeMeshes'].get(13)).toBe(mesh);
    expect(view['liveNadeIds']).toBe(ids);
    view.match.nades.pop();
    view['updateNades'](1 / 60);
    expect(view['nadeMeshes'].size).toBe(0);
    expect(freeGeo).toHaveBeenCalledTimes(1);
    expect(freeMat).toHaveBeenCalledTimes(1);
    view['updateNades'](1 / 60);
    expect(freeGeo).toHaveBeenCalledTimes(1);
  });

  it('reuses the loot scratch set and cleans up deleted distant items', () => {
    const view = viewFor(), ids = view['liveLootIds'], dispose = vi.fn();
    const obj = new THREE.Group();
    view['lootNodes'].set(29, { node: obj, baseY: 1, dispose });
    view['syncLoot'](new THREE.Vector3(0, 2, 0));
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(view['lootNodes'].size).toBe(0);
    for (let i = 0; i < 100; i++) view['syncLoot'](new THREE.Vector3(i, 2, 0));
    expect(view['liveLootIds']).toBe(ids);
  });

  it('reuses scratch vectors for tracer orientation and respects the maximum length', () => {
    const view = viewFor(), dir = view['tracerDir'], up = view['tracerUp'];
    view['tracer'](0, 1, 0, 100, 1, 0, 0xffd9a0);
    const first = view['tracers'][0].mesh;
    expect(first.position.x).toBeCloseTo(70);
    expect(first.scale.y).toBe(60);
    view['tracer'](0, 1, 0, 0, 1, -15, 0x8a8f96);
    expect(view['tracers']).toHaveLength(2);
    expect(view['tracerDir']).toBe(dir);
    expect(view['tracerUp']).toBe(up);
    expect(view['tracers'][1].mesh.quaternion.length()).toBeCloseTo(1);
    view['tracerPool'].dispose();
  });
});
