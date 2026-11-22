import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {RaceView} from '../../src/race/view';
describe('SPEED RUSH transparent ghost resource lifecycle',()=>{
  it('releases fallback geometry and ghost material when ghost replay is disabled',()=>{
    const scene=new THREE.Scene();
    const fake=Object.assign(Object.create(RaceView.prototype),{scene,carTemplates:null,ghostCar:null,ghostMaterial:null,ghostGeometry:null,disposables:[]}) as RaceView;
    fake.setGhost('gt',true);
    const mesh=(scene.children[0] as THREE.Group).children[0] as THREE.Mesh;
    const g=vi.spyOn(mesh.geometry,'dispose');
    const m=vi.spyOn(mesh.material as THREE.Material,'dispose');
    fake.setGhost('gt',false);
    expect(g).toHaveBeenCalledOnce();expect(m).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(0);
  });
  it('does not retain previous ghost buffers when changing models',()=>{
    const scene=new THREE.Scene();
    const fake=Object.assign(Object.create(RaceView.prototype),{scene,carTemplates:null,ghostCar:null,ghostMaterial:null,ghostGeometry:null,disposables:[]}) as RaceView;
    fake.setGhost('gt',true);
    const first=(scene.children[0] as THREE.Group).children[0] as THREE.Mesh;
    const disposed=vi.spyOn(first.geometry,'dispose');
    fake.setGhost('wide',true);
    expect(disposed).toHaveBeenCalledOnce();expect(scene.children).toHaveLength(1);
    fake.setGhost('',false);
  });
});
