import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cullChunks, type ChunkRef } from '../../src/city/chunks';

const chunkAt = (x: number, z: number): ChunkRef => ({ mesh: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 1), x, z, r: 100 });

describe('cullChunks', () => {
  it('hides chunks beyond the reach distance and shows the ones within it', () => {
    const list = [chunkAt(100, 100), chunkAt(4000, 100)];
    cullChunks(list, new THREE.Vector3(100, 0, 100), 1500);
    expect(list.map(c => c.mesh.visible)).toEqual([true, false]);
    cullChunks(list, new THREE.Vector3(100, 0, 100), 5000);
    expect(list.every(c => c.mesh.visible)).toBe(true);
  });
  it('counts the chunk radius so a chunk that only touches the reach stays visible', () => {
    const list = [chunkAt(1550, 0)];
    cullChunks(list, new THREE.Vector3(0, 0, 0), 1500);
    expect(list[0].mesh.visible).toBe(true);
  });
});
