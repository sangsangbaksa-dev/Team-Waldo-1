import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { batchStaticChildren } from '../../src/battle/renderBatches';

describe('WebGL geometry batching regression', () => {
  it('merges indexed, UV-mapped walls with non-indexed roofs lacking UVs', () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x556677 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    box.position.set(2, 0, 0);
    box.castShadow = true;
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute([
      -1, 0, 0, 0, 2, 0, 1, 0, 0,
    ], 3));
    roof.computeVertexNormals();
    const wedge = new THREE.Mesh(roof, material);
    wedge.receiveShadow = true;
    parent.add(box, wedge);
    const batches = batchStaticChildren(parent);
    expect(batches).toHaveLength(1);
    expect(batches[0].geometry.index).toBeNull();
    expect(batches[0].geometry.getAttribute('position').count).toBe(39);
    expect(batches[0].geometry.getAttribute('normal').count).toBe(39);
    expect(batches[0].geometry.getAttribute('uv')).toBeUndefined();
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]).toBeInstanceOf(THREE.Mesh);
    expect(batches[0].castShadow).toBe(true);
    expect(batches[0].receiveShadow).toBe(true);
    batches[0].geometry.dispose();
    box.geometry.dispose(); roof.dispose(); material.dispose();
  });
});

describe('static geometry batching',()=>{
 it('combines indexed structures with nonindexed mineral crystals without losing transforms',()=>{
  const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  const building=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),material);
  const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(1),material);crystal.position.x=10;
  root.add(building,crystal);const count=building.geometry.index!.count+crystal.geometry.getAttribute('position').count;
  const batches=batchStaticChildren(root);
  expect(batches).toHaveLength(1);expect(root.children).toHaveLength(1);
  const geometry=batches[0].geometry;expect(geometry.getAttribute('position').count).toBe(count);geometry.computeBoundingBox();expect(geometry.boundingBox!.max.x).toBeGreaterThan(10);
  geometry.dispose();building.geometry.dispose();crystal.geometry.dispose();material.dispose();
 });
});
