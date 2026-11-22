import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BoxProxy, LodSet, splitInstanced } from '../../src/shared/lod';

describe('LodSet', () => {
  it('거리에 따라 제대로 → 프록시 → 끔 으로 바꾼다', () => {
    const full = new THREE.Object3D(), proxy = new THREE.Object3D(), set = new LodSet({ near: 100, far: 300 });
    set.add({ x: 0, z: 0, r: 10, full: [full], proxy: [proxy] });
    set.update({ x: 50, z: 0 }); expect([full.visible, proxy.visible]).toEqual([true, false]);
    set.update({ x: 200, z: 0 }); expect([full.visible, proxy.visible]).toEqual([false, true]);
    set.update({ x: 900, z: 0 }); expect([full.visible, proxy.visible]).toEqual([false, false]);
    expect(set.counts()).toEqual([0, 0, 1]);
  });
  it('경계에서는 hysteresis 로 깜빡이지 않는다', () => {
    const full = new THREE.Object3D(), set = new LodSet({ near: 100, far: 300 });
    set.add({ x: 0, z: 0, r: 0, full: [full] });
    set.update({ x: 103, z: 0 }); expect(full.visible).toBe(true);
    set.update({ x: 120, z: 0 }); expect(full.visible).toBe(false);
    set.update({ x: 97, z: 0 }); expect(full.visible).toBe(false);
    set.update({ x: 80, z: 0 }); expect(full.visible).toBe(true);
  });
  it('scale 로 모든 거리를 줄인다', () => {
    const full = new THREE.Object3D(), set = new LodSet({ near: 100, far: 300 }); set.scale = 0.5;
    set.add({ x: 0, z: 0, r: 0, full: [full] }); set.update({ x: 70, z: 0 }); expect(full.visible).toBe(false);
  });
});

describe('splitInstanced', () => {
  it('인스턴스를 칸으로 나누고 개수를 보존한다', () => {
    const src = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 4), root = new THREE.Group(), m = new THREE.Matrix4(); root.add(src);
    [[0, 0], [5, 5], [500, 0], [500, 500]].forEach(([x, z], i) => src.setMatrixAt(i, m.makeTranslation(x, 0, z)));
    const cells = splitInstanced(src, 100, root);
    expect(cells.length).toBe(3); expect(cells.reduce((n, c) => n + c.mesh.count, 0)).toBe(4); expect(root.children.includes(src)).toBe(false);
  });
});

describe('BoxProxy', () => {
  it('박스를 한 지오메트리로 합친다', () => {
    const p = new BoxProxy().box(0, 0, 0, 1, 1, 1, 0xff0000).box(2, 0, 0, 3, 5, 1, 0x00ff00), g = p.build()!;
    expect(g.getAttribute('position').count).toBe(72); expect(g.getAttribute('color').count).toBe(72);
    expect(new BoxProxy().build()).toBeNull();
  });
});
