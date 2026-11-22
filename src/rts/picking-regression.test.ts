import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RtsView } from './view';
import type { RtsSim } from './sim';

function viewFor(entities: {
  units?: Array<{ id: number; owner: number; x: number; y: number; kind: 'marine' }>;
  nodes?: Array<{ id: number; x: number; y: number }>;
}): RtsView {
  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 700);
  camera.position.set(5, 9, 12);
  camera.lookAt(5, 0, 5);
  camera.updateMatrixWorld();
  const view = Object.create(RtsView.prototype) as RtsView;
  Object.assign(view, {
    sim: {
      units: entities.units ?? [], nodes: entities.nodes ?? [], buildings: [],
    } as unknown as RtsSim,
    viewer: 0, vision: null, camera, w: 400, h: 400,
    raycaster: new THREE.Raycaster(), pointerNdc: new THREE.Vector2(),
    pickHit: new THREE.Vector3(), pickCenter: new THREE.Vector3(),
    pickBox: new THREE.Box3(), pickSphere: new THREE.Sphere(),
  });
  return view;
}

describe('FRONTLINE raycast picking scratch-object reuse', () => {
  it('keeps ground projection stable during repeated mouse movement', () => {
    const view = viewFor({});
    const first = view.ground(200, 200);
    expect(first?.x).toBeCloseTo(5);
    expect(first?.y).toBeCloseTo(5);
    const ndc = view['pointerNdc'];
    for (let i = 0; i < 200; i++) expect(view.ground(200, 200)).toEqual(first);
    expect(view['pointerNdc']).toBe(ndc);
  });
  it('selects visible units without reallocating the raycast scratch geometry', () => {
    const view = viewFor({units: [{id: 11, owner: 0, x: 5, y: 5, kind: 'marine'}]});
    const sphere = view['pickSphere'], center = view['pickCenter'];
    for (let i = 0; i < 30; i++) expect(view.pick(200, 200)).toBe(11);
    expect(view['pickSphere']).toBe(sphere);
    expect(view['pickCenter']).toBe(center);
  });
  it('respects fog visibility when a distant enemy is otherwise under the cursor', () => {
    const view = viewFor({units: [{id: 15, owner: 1, x: 5, y: 5, kind: 'marine'}]});
    view.vision = {visible: () => false} as unknown as RtsView['vision'];
    expect(view.pick(200, 200)).toBe(0);
  });
  it('still selects mineral nodes with the pooled intersection vector', () => {
    const view = viewFor({nodes: [{id: 31, x: 4.5, y: 4.5}]});
    expect(view.pick(200, 200)).toBe(31);
  });
});
