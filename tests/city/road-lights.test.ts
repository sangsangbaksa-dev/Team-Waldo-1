import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {lightMask,lightRange,nearVisual,RoadLightBatch} from '../../src/shared/road-lights';
import {trackLightStrength} from '../../src/race/road-visuals';
describe('shared vehicle ground illumination',()=>{
  it('clips headlight illumination at a nearby wall',()=>{
    expect(lightRange(120,()=>false)).toBe(120);
    expect(lightRange(120,d=>d>=40)).toBe(30);
    expect(lightRange(120,()=>true)).toBe(0);
  });
  it('uses a soft mask with a transparent perimeter',()=>{
    const mask=lightMask(32);
    expect(mask[3]).toBe(0);expect(mask[(16*32+16)*4+3]).toBeGreaterThan(240);
  });
  it('bounds batches and supports disposal',()=>{
    const scene=new THREE.Scene(),batch=new RoadLightBatch(scene,2);
    batch.begin();for(let i=0;i<5;i++)batch.add(i,0,0,0,5,2,0xffffff,0.5);
    batch.end();expect(batch.remaining).toBe(0);
    const mesh=scene.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(2);expect(mesh.visible).toBe(true);
    batch.begin();batch.end();expect(mesh.visible).toBe(false);batch.dispose();expect(scene.children.length).toBe(0);
  });
  it('does not add light on a sunny dry track or draw far actors',()=>{
    expect(trackLightStrength(1.6,0)).toBe(0);expect(trackLightStrength(0.6,1)).toBeGreaterThan(0.5);
    expect(nearVisual(3,4,0,0,5)).toBe(true);expect(nearVisual(3,4,0,0,4.9)).toBe(false);
  });
});
