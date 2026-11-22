import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BoxProxy, LodSet, splitInstanced, tileHeightfield } from '../../src/shared/lod';

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

describe('tileHeightfield', () => {
  const plane = (): THREE.BufferGeometry => { const g = new THREE.PlaneGeometry(80, 80, 8, 8); g.rotateX(-Math.PI / 2); const p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) p.setY(i, Math.sin(p.getX(i) * 0.2) * 3); g.computeVertexNormals(); return g; };
  it('칸·정점·삼각형 수가 맞고 성긴 쪽이 더 가볍다', () => {
    const t = tileHeightfield(plane(), 8, 2, 2, 1);
    expect(t.length).toBe(4);
    expect(t[0].full.getAttribute('position').count).toBe(25 + 4 * 5); expect(t[0].coarse.getAttribute('position').count).toBe(9 + 4 * 3);
    expect(t[0].full.index!.count / 3).toBe(32 + 32); expect(t[0].coarse.index!.count / 3).toBeLessThan(t[0].full.index!.count / 3);
    expect(t[0].full.getAttribute('normal').count).toBe(t[0].full.getAttribute('position').count);
  });
  it('칸을 합치면 원본 바닥 면적 전체를 덮고(위쪽 면 수 보존) 치마는 바깥을 향한다', () => {
    const t = tileHeightfield(plane(), 8, 2, 2, 1); let up = 0;
    for (const tile of t) {
      const g = tile.full, p = g.getAttribute('position'), ix = g.index!, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
      for (let k = 0; k < ix.count; k += 3) {
        a.fromBufferAttribute(p, ix.getX(k)); b.fromBufferAttribute(p, ix.getX(k + 1)); c.fromBufferAttribute(p, ix.getX(k + 2));
        const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        if (n.y > 0.5) up++;
        else { const m = a.clone().add(b).add(c).divideScalar(3); expect((m.x - tile.x) * n.x + (m.z - tile.z) * n.z).toBeGreaterThan(0); } // 치마 면은 칸 바깥쪽
      }
    }
    expect(up).toBe(8 * 8 * 2);
  });
  it('나누어떨어지지 않으면 거부한다', () => { expect(() => tileHeightfield(plane(), 8, 3, 2, 1)).toThrow(); });
});
