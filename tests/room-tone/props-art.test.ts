import { test } from "vitest";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildStationArt, buildCollectibleArt, buildExitDoorArt, addContactShadow, batchStaticMeshes } from "../../src/room-tone/props-art.js";

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

test("all twelve collectibles stay within the display cradle and vary by chapter",()=>{
  const signatures=new Set<string>();
  for(let ch=0;ch<4;ch++)for(let i=0;i<3;i++){
    const root=new THREE.Group();
    const bright=new THREE.MeshStandardMaterial(),dark=new THREE.MeshStandardMaterial(),steel=new THREE.MeshStandardMaterial();
    buildCollectibleArt(THREE,root,ch,i,bright,dark,steel);
    const b=new THREE.Box3().setFromObject(root);
    assert.ok(b.min.x>=-.26&&b.max.x<=.26);
    assert.ok(b.min.y>=-.18&&b.max.y<=.18);
    assert.ok(b.min.z>=-.13&&b.max.z<=.13);
    assert.ok(root.children.length>=6);
    if(i===0)signatures.add(root.children.map(child=>(child as THREE.Mesh).geometry.type+":"+child.position.toArray().join(",")).join(";"));
  }
  assert.equal(signatures.size,4);
});

test("exit door fits a solid tile face and respects wall clearance",()=>{
  const root=new THREE.Group();
  const bright=new THREE.MeshStandardMaterial(),dark=new THREE.MeshStandardMaterial(),steel=new THREE.MeshStandardMaterial();
  buildExitDoorArt(THREE,root,bright,dark,steel);
  const b=new THREE.Box3().setFromObject(root);
  assert.ok(b.min.x>=-1.10&&b.max.x<=1.10);
  assert.ok(b.min.y>=-.001&&b.max.y<=2.7);
  assert.ok(b.min.z>=-.001&&b.max.z<=.24);
  let meshes=0;
  root.traverse(child=>{if((child as THREE.Mesh).isMesh)meshes++;});
  assert.ok(meshes>=20);
});

test("static batches lower draw objects while retaining world bounds and shadow transparency",()=>{
  for(let ch=0;ch<4;ch++){
    const root=new THREE.Group();
    const bright=new THREE.MeshStandardMaterial(),dark=new THREE.MeshStandardMaterial(),steel=new THREE.MeshStandardMaterial();
    buildStationArt(THREE,root,ch,bright,dark,steel);
    const shadow=addContactShadow(THREE,root,1.48,1.06,new THREE.Texture());
    const before=new THREE.Box3().setFromObject(root), count=root.children.length;
    const removed=batchStaticMeshes(THREE,root);
    const after=new THREE.Box3().setFromObject(root);
    assert.ok(removed>10);
    assert.equal(root.children.length,count-removed);
    assert.ok(before.min.distanceTo(after.min)<.0001);
    assert.ok(before.max.distanceTo(after.max)<.0001);
    assert.ok(root.children.includes(shadow));
    assert.equal(batchStaticMeshes(THREE,root),0);
    const batches=root.children.filter(child=>(child as THREE.InstancedMesh).isInstancedMesh);
    assert.ok(batches.length>0);
  }
});

test("door leaves slide independently into fixed jambs and reset safely",()=>{
  const root=new THREE.Group();
  root.position.set(5,0,3);root.rotation.y=Math.PI/2;
  const bright=new THREE.MeshStandardMaterial(),dark=new THREE.MeshStandardMaterial(),steel=new THREE.MeshStandardMaterial();
  const door=buildExitDoorArt(THREE,root,bright,dark,steel);
  batchStaticMeshes(THREE,root);
  const left=root.getObjectByName("Left acoustic leaf")!,right=root.getObjectByName("Right acoustic leaf")!;
  door.setProgress(.5);
  assert.equal(left.position.x,-.47);
  assert.equal(right.position.x,.47);
  const mesh=left.children.find(child=>(child as THREE.Mesh).isMesh) as THREE.Mesh;
  const plane=(mesh.material as THREE.Material).clippingPlanes![0];
  assert.ok(plane.distanceToPoint(door.worldCenter())>0);
  const constant=plane.constant;
  door.setProgress(.9);
  assert.equal(plane.constant,constant);
  door.setProgress(1);
  assert.equal(left.visible,false);
  assert.equal(right.visible,false);
  door.setProgress(0);
  assert.equal(left.visible,true);
  assert.equal(right.position.x,0);
});
