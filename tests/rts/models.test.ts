import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BUILDINGS, type BuildKind } from '../../src/rts/config';
import { makeBuilding, makeUnit } from '../../src/rts/models';
describe('FRONTLINE military 3D models',()=>{
  it('keeps building geometry within the intended footprint',()=>{
    for(const kind of Object.keys(BUILDINGS) as BuildKind[]){
      const rig=makeBuilding(kind,0), box=new THREE.Box3().setFromObject(rig.root), size=box.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(BUILDINGS[kind].size+0.4);
      expect(size.z).toBeLessThan(BUILDINGS[kind].size+0.4);
      expect(size.y).toBeGreaterThan(0.6);
      expect(rig.root.children.length).toBeLessThan(45);
    }
  });
  it('keeps tank and jeep geometry finite with separated weapon rigs',()=>{
    for(const kind of ['tank','jeep'] as const){
      const rig=makeUnit(kind,0);
      expect(rig.gun).not.toBeNull();
      expect(rig.flash.visible).toBe(false);
      rig.root.traverse(o=>{if(o instanceof THREE.Mesh)expect(Array.from(o.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);});
    }
  });
});
