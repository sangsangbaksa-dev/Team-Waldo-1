import { test } from "vitest";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildStationArt, addContactShadow } from "../../src/room-tone/props-art.js";

test("each restoration station has distinct geometry within its original footprint", () => {
  const signatures = new Set<string>();
  for (let chapter=0;chapter<4;chapter++) {
    const root=new THREE.Group();
    const bright=new THREE.MeshStandardMaterial(),dark=new THREE.MeshStandardMaterial(),steel=new THREE.MeshStandardMaterial();
    buildStationArt(THREE,root,chapter,bright,dark,steel);
    const bounds=new THREE.Box3().setFromObject(root);
    assert.ok(bounds.min.y>=-0.001 && bounds.max.y<=1.40);
    assert.ok(bounds.min.x>=-.50 && bounds.max.x<=.50);
    assert.ok(bounds.min.z>=-.35 && bounds.max.z<=.35);
    assert.ok(root.children.length>20);
    signatures.add(root.children.map(child=>{
      const mesh=child as THREE.Mesh;
      return mesh.geometry.type+":"+mesh.position.toArray().join(",");
    }).join(";"));
  }
  assert.equal(signatures.size,4);
});
test("contact shadow stays within a navigation tile and does not write depth",()=>{
  const root=new THREE.Group();
  const shadow=addContactShadow(THREE,root,1.48,1.06,new THREE.Texture());
  assert.equal(shadow.material.depthWrite,false);
  assert.equal(shadow.material.transparent,true);
  assert.equal(shadow.rotation.x,-Math.PI/2);
  assert.equal(shadow.position.y,.004);
  const box=new THREE.Box3().setFromObject(root);
  assert.ok(box.max.x-box.min.x<2.7 && box.max.z-box.min.z<2.7);
});
