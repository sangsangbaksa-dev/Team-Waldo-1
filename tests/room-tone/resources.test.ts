import { describe,expect,it,vi } from "vitest";
import * as THREE from "three";
import { disposeGroup } from "../../src/room-tone/resources.mjs";

describe("ROOM TONE chapter GPU resource disposal",()=>{
  it("disposes shared geometry, material and every texture exactly once",()=>{
    const parent=new THREE.Group();
    const root=new THREE.Group();
    parent.add(root);
    const geometry=new THREE.BoxGeometry(1,1,1);
    const map=new THREE.Texture();
    const bump=new THREE.Texture();
    const material=new THREE.MeshStandardMaterial({map,bumpMap:bump});
    const geometryDispose=vi.spyOn(geometry,"dispose");
    const materialDispose=vi.spyOn(material,"dispose");
    const mapDispose=vi.spyOn(map,"dispose");
    const bumpDispose=vi.spyOn(bump,"dispose");
    root.add(new THREE.Mesh(geometry,material),new THREE.Mesh(geometry,material));
    disposeGroup(root);
    expect(parent.children).toHaveLength(0);
    expect(root.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(mapDispose).toHaveBeenCalledOnce();
    expect(bumpDispose).toHaveBeenCalledOnce();
    disposeGroup(root);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(mapDispose).toHaveBeenCalledOnce();
    expect(bumpDispose).toHaveBeenCalledOnce();
  });
  it("ignores null roots and objects without GPU resources",()=>{
    expect(()=>disposeGroup(null)).not.toThrow();
    const root=new THREE.Group();
    expect(()=>disposeGroup(root)).not.toThrow();
    expect(root.children).toHaveLength(0);
  });
});
