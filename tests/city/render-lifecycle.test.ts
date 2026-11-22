import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {CityRenderLifetime} from '../../src/city/render-lifecycle';
import {instantiate} from '../../src/city/models';
describe('LAST CITY live object GPU lifecycle',()=>{
  it('releases only destroyed objects while preserving reused box geometry and paint',()=>{
    const scene=new THREE.Scene(),life=new CityRenderLifetime();
    const shared=life.retain(new THREE.BoxGeometry()),paint=life.retain(new THREE.MeshLambertMaterial());
    const disposable=new THREE.CylinderGeometry(),glow=new THREE.MeshBasicMaterial();
    const alive=new THREE.Mesh(shared,paint),group=new THREE.Group();
    group.add(new THREE.Mesh(shared,paint),new THREE.Mesh(disposable,glow));scene.add(group,alive);
    const gShared=vi.spyOn(shared,'dispose'),mShared=vi.spyOn(paint,'dispose');
    const gDisposable=vi.spyOn(disposable,'dispose'),mDisposable=vi.spyOn(glow,'dispose');
    life.remove(scene,group);
    expect(gDisposable).toHaveBeenCalledTimes(1);expect(mDisposable).toHaveBeenCalledTimes(1);
    expect(gShared).not.toHaveBeenCalled();expect(mShared).not.toHaveBeenCalled();
    expect(scene.children).toEqual([alive]);
    shared.dispose();paint.dispose();
  });
  it('does not release cached GLB parts when a temporary instance is removed',()=>{
    const scene=new THREE.Scene(),life=new CityRenderLifetime();
    const template=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({color:0x777777}));
    const clone=instantiate(template),mesh=clone as THREE.Mesh;
    const geom=vi.spyOn(mesh.geometry,'dispose');
    const mat=vi.spyOn(mesh.material as THREE.Material,'dispose');
    scene.add(clone);life.remove(scene,clone);
    expect(geom).not.toHaveBeenCalled();expect(mat).not.toHaveBeenCalled();
  });
});
