import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isolateRearLamps, makeFallbackCar } from '../../src/race/visual-car';
describe('SPEED RUSH 3D fallback model',()=>{
  it('builds a low sports car with four wheels, finite geometry and visible top faces',()=>{
    const car=makeFallbackCar(0x284a9d,0xffcf55);
    car.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(car.root), size=bounds.getSize(new THREE.Vector3());
    expect(car.wheels).toHaveLength(4);
    expect(size.x).toBeGreaterThan(4.4); expect(size.x).toBeLessThan(5);
    expect(size.y).toBeGreaterThan(1.1); expect(size.y).toBeLessThan(1.5);
    expect(size.z).toBeGreaterThan(2);
    const cast=new THREE.Raycaster(new THREE.Vector3(0,5,0),new THREE.Vector3(0,-1,0));
    expect(cast.intersectObject(car.root,true)[0]?.point.y).toBeGreaterThan(1.2);
    car.root.traverse(o=>{if(o instanceof THREE.Mesh)expect(Array.from(o.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);});
  });
});

it('isolates actual GLB rear lamp materials across racers including multi-material meshes',()=>{
  const red=new THREE.MeshBasicMaterial({color:0xff0000});red.name='GlowRed';
  const body=new THREE.MeshBasicMaterial({color:0x101010});
  const root=new THREE.Group();const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),[red,body]);root.add(mesh);
  const other=root.clone(true), lamps=isolateRearLamps(root), otherLamps=isolateRearLamps(other);
  expect(lamps).toHaveLength(1);expect(otherLamps).toHaveLength(1);
  lamps[0].color.setRGB(3,0,0);
  expect(otherLamps[0].color.r).toBe(1);expect(red.color.r).toBe(1);
  expect(mesh.material[1]).toBe(body);
});
