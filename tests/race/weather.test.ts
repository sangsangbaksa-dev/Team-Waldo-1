import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RaceRain, wrapRain } from '../../src/race/weather';

describe('SPEED RUSH line rain',()=>{
  it('wraps positions on either side of the origin',()=>{
    expect(wrapRain(-1001,84)).toBe(7);expect(wrapRain(1001,84)).toBe(77);
  });
  it('keeps rain in the camera volume even at large map coordinates',()=>{
    const rain=new RaceRain(30),cam=new THREE.Vector3(1135,12,-2976);
    rain.update(.1,cam,.5);
    expect(rain.mesh.geometry.drawRange.count).toBe(30);
    const p=rain.mesh.geometry.attributes.position;
    for(let i=0;i<30;i++){expect(Math.abs(p.getX(i)-cam.x)).toBeLessThan(43);expect(Math.abs(p.getZ(i)-cam.z)).toBeLessThan(43);}
    rain.update(.1,cam,0);expect(rain.mesh.visible).toBe(false);
  });
});