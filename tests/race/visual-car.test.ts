import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeFallbackCar } from '../../src/race/visual-car';
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
