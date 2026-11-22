import {describe,it,expect,vi} from 'vitest';
import {writeSkidQuad} from '../../src/race/skid-geometry';
import {SkidMarks} from '../../src/race/view';
import type * as THREE from 'three';

describe('SPEED RUSH tire-mark buffer performance and continuity',()=>{
  it('writes two triangles, preserving neighboring GPU buffer slots',()=>{
    const pos=new Float32Array(54).fill(-999),col=new Float32Array(72).fill(-1);
    writeSkidQuad(pos,col,1,1,2,3,4,5,6,0.1,0.2,0.5);
    expect(Array.from(pos.slice(18,36))).toEqual([
      expect.closeTo(0.9),2,expect.closeTo(2.8),
      expect.closeTo(1.1),2,expect.closeTo(3.2),
      expect.closeTo(3.9),5,expect.closeTo(5.8),
      expect.closeTo(1.1),2,expect.closeTo(3.2),
      expect.closeTo(4.1),5,expect.closeTo(6.2),
      expect.closeTo(3.9),5,expect.closeTo(5.8),
    ]);
    expect(pos.slice(0,18).every(v=>v===-999)).toBe(true);
    expect(pos.slice(36).every(v=>v===-999)).toBe(true);
    for(let i=24;i<48;i+=4){expect(col[i]).toBeCloseTo(.02);expect(col[i+2]).toBeCloseTo(.03);expect(col[i+3]).toBeCloseTo(.5);}
    expect(col.slice(0,24).every(v=>v===-1)).toBe(true);
  });
  it('retains continuous segments when distance exceeds the single-frame skid limit',()=>{
    const skids=new SkidMarks(8);const positions=skids.mesh.geometry.getAttribute('position').array as Float32Array;
    skids.mark(42,0,0,0,.45);
    skids.mark(42,5,0,0,.45);skids.flush();
    // A 5m jump generates two connected 2.5m segments instead of a visual gap.
    expect(positions[6]).toBeCloseTo(2.5);
    expect(positions[18]).toBeCloseTo(2.5);
    expect(positions[24]).toBeCloseTo(5);
    skids.mark(42,7,0,0,.45);skids.flush();
    expect(positions[36]).toBeCloseTo(5);
    skids.mesh.geometry.dispose();
    (skids.mesh.material as THREE.Material).dispose();
  });
  it('drops corrupt marks and breaks trails across teleports',()=>{
    const skids=new SkidMarks(8),pos=skids.mesh.geometry.getAttribute('position').array as Float32Array;
    skids.mark(1,0,0,0,.5);skids.mark(1,NaN,0,0,.5);
    skids.mark(1,500,0,0,.5);skids.mark(1,501,0,0,.5);
    expect(pos[0]).toBeCloseTo(500);
    skids.lift(1);skids.mark(1,1000,0,0,.5);
    expect(pos[18]).toBe(0);
    skids.mesh.geometry.dispose();(skids.mesh.material as THREE.Material).dispose();
  });
});
