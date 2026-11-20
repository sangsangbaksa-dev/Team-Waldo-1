import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {disposeRenderTrees} from '../../src/shared/scene-disposal';
import {instantiate,isSharedModelResource} from '../../src/city/models';
describe('3D session resource ownership',()=>{
  it('disposes geometry, material and textures once across trees and extras',()=>{
    const scene=new THREE.Scene(),g=new THREE.BoxGeometry(),tex=new THREE.Texture(),m=new THREE.MeshBasicMaterial({map:tex});
    const a=vi.spyOn(g,'dispose'),b=vi.spyOn(m,'dispose'),c=vi.spyOn(tex,'dispose');
    scene.add(new THREE.Mesh(g,m),new THREE.Mesh(g,m));disposeRenderTrees([scene],()=>false,[g,m,tex]);
    expect(a).toHaveBeenCalledTimes(1);expect(b).toHaveBeenCalledTimes(1);expect(c).toHaveBeenCalledTimes(1);
  });
  it('retains cached asset geometry and shared material after a clone is removed',()=>{
    const template=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({color:0x145ca3}));
    const clone=instantiate(template) as THREE.Mesh;
    const g=vi.spyOn(template.geometry,'dispose'),m=vi.spyOn(clone.material as THREE.Material,'dispose');
    disposeRenderTrees([clone],isSharedModelResource);
    expect(g).not.toHaveBeenCalled();expect(m).not.toHaveBeenCalled();
  });
});
