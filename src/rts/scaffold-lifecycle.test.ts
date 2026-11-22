import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BUILDINGS } from './config';
import type { Building } from './sim';
import { RtsView } from './view';

function fakeView(): RtsView {
  // addBuilding creates CPU-side meshes only; avoid creating a WebGL context.
  const view = Object.create(RtsView.prototype) as RtsView;
  Object.assign(view, {
    scene: new THREE.Scene(),
    quality: 'standard',
    viewer: 0,
    ringMats: [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()],
    builds: new Map(),
  });
  return view;
}
function building(done: boolean, id: number): Building {
  return { id, kind: 'hq', owner: 0, x: 10, y: 12, size: BUILDINGS.hq.size, done } as Building;
}

describe('FRONTLINE completed building scaffold cleanup', () => {
  it('does not create hidden construction meshes for buildings already finished', () => {
    const view = fakeView();
    view['addBuilding'](building(true, 1));
    const visible = view['builds'].get(1)!;
    expect(visible.scaff.children).toHaveLength(0);
    expect(visible.rig.root.children.length).toBeGreaterThan(0);
  });
  it('creates scaffolding only for active construction sites', () => {
    const view = fakeView();
    view['addBuilding'](building(false, 2));
    const unfinished = view['builds'].get(2)!;
    expect(unfinished.scaff.children.length).toBeGreaterThan(8);
    view['disposeOwned'](unfinished.scaff);
    unfinished.scaff.clear();
    expect(unfinished.scaff.children).toHaveLength(0);
    expect(unfinished.scaff.parent).toBeNull();
  });
});
