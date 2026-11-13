import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {batchStaticChildren} from '../../src/battle/renderBatches';
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
