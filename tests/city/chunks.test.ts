import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHUNK, chunkInstances, cullChunks, type ChunkRef } from '../../src/city/chunks';

function meshAt(points: [number, number][]): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial(), points.length), d = new THREE.Object3D();
  points.forEach(([x, z], i) => { d.position.set(x, 0, z); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
  m.count = points.length; m.castShadow = true; return m;
}

describe('chunkInstances', () => {
  it('keeps every instance and groups them by grid cell', () => {
    const pts: [number, number][] = [[10, 10], [20, 30], [CHUNK + 5, 10], [CHUNK * 3 + 1, CHUNK * 2 + 1], [CHUNK * 3 + 9, CHUNK * 2 + 40]];
    const scene = new THREE.Scene(), src = meshAt(pts), out: ChunkRef[] = [];
    scene.add(src); chunkInstances(src, scene, out);
    expect(scene.children).not.toContain(src);
    expect(out).toHaveLength(3);
    expect(out.reduce((n, c) => n + c.mesh.count, 0)).toBe(pts.length);
    for (const c of out) { expect(c.mesh.castShadow).toBe(true); expect(c.mesh.frustumCulled).toBe(true); expect(c.mesh.geometry).toBe(src.geometry); }
    const tr = new THREE.Vector3(), got = out.flatMap(c => Array.from({ length: c.mesh.count }, (_, i) => { const m = new THREE.Matrix4(); c.mesh.getMatrixAt(i, m); return tr.setFromMatrixPosition(m).toArray().join(','); }));
    expect(got.sort()).toEqual(pts.map(([x, z]) => `${x},0,${z}`).sort());
  });

  it('hides chunks beyond the reach distance', () => {
    const scene = new THREE.Scene(), src = meshAt([[100, 100], [4000, 100]]), out: ChunkRef[] = [];
    scene.add(src); chunkInstances(src, scene, out);
    cullChunks(out, new THREE.Vector3(100, 0, 100), 1500);
    expect(out.map(c => c.mesh.visible).sort()).toEqual([false, true]);
    cullChunks(out, new THREE.Vector3(100, 0, 100), 5000);
    expect(out.every(c => c.mesh.visible)).toBe(true);
  });
});
