import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {WetStreet} from '../../src/city/wetstreet';
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
