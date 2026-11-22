import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {WetStreet,puddleDetail} from '../../src/city/wetstreet';
import {atmosphereAt} from '../../src/city/atmosphere';

describe('LAST CITY high-quality road reflection lifecycle',()=>{
  function fake(throws:boolean){
    const mat=new THREE.MeshBasicMaterial({transparent:true});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(4,4),mat);
    const cube={position:new THREE.Vector3(),update:vi.fn(()=>{
      if(throws)throw new Error('webgl interrupted');
    })};
    const wet=Object.assign(Object.create(WetStreet.prototype),{mat,mesh,cube,since:99}) as WetStreet;
    return {wet,mesh,cube};
  }
  const atm=atmosphereAt(23,'storm');
  it('restores all scenery visibility when cube camera rendering throws',()=>{
    const {wet,mesh,cube}=fake(true);
    const hidden=new THREE.Group(),previouslyHidden=new THREE.Group();
    previouslyHidden.visible=false;
    expect(()=>wet.update(1/60,atm,new THREE.Vector3(20,30,40),{} as THREE.WebGLRenderer,new THREE.Scene(),[hidden,previouslyHidden])).toThrow('webgl interrupted');
    expect(cube.update).toHaveBeenCalledTimes(1);
    expect(mesh.visible).toBe(true);
    expect(hidden.visible).toBe(true);
    expect(previouslyHidden.visible).toBe(false);
    mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();
  });
  it('restores the scene after a successful cube update as well',()=>{
    const {wet,mesh,cube}=fake(false);
    const visible=new THREE.Group();
    wet.update(1/60,atm,new THREE.Vector3(30,20,10),{} as THREE.WebGLRenderer,new THREE.Scene(),[visible]);
    expect(cube.update).toHaveBeenCalledTimes(1);
    expect(visible.visible).toBe(true);expect(mesh.visible).toBe(true);
    mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();
  });
});

describe('LAST CITY wet-road GPU memory tiers',()=>{
  it('keeps 2048px high-quality puddle textures and reduces lower-tier allocations',()=>{
    const high=puddleDetail('high'),standard=puddleDetail('standard'),low=puddleDetail('low');
    expect(high.resolution).toBe(2048);
    expect(standard.resolution).toBe(1024);
    expect(low.resolution).toBe(512);
    expect(high.roadCount).toBeGreaterThan(standard.roadCount);
    expect(standard.roadCount).toBeGreaterThan(low.roadCount);
    // RGBA base level only, before mipmaps, shrinks by 4x per quality step.
    expect(standard.resolution**2*4).toBe(high.resolution**2);
    expect(low.resolution**2*4).toBe(standard.resolution**2);
  });
});
