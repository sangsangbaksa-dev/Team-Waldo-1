import {describe,expect,it} from 'vitest';
import {buildTrack} from '../../src/race/track';
import {MAPS} from '../../src/race/maps';
import {SLOTS} from '../../src/race/race';
import {brakeGlow,gridPaint,reflectorIndices} from '../../src/race/track-detail';
describe('SPEED RUSH track artwork',()=>{
  it('uses finite, bounded grid markings on all seven circuits',()=>{
    for(const map of MAPS){
      const t=buildTrack(map.points,map.halfWidth);
      const v=gridPaint(t,SLOTS);
      expect(v.length).toBe(SLOTS.length*3*18);expect(v.every(Number.isFinite)).toBe(true);
      const markers=reflectorIndices(t.n,t.ds,false);
      expect(markers.length).toBeLessThanOrEqual(240);
      expect(reflectorIndices(t.n,t.ds,true).length).toBeLessThanOrEqual(markers.length);
    }
  });
  it('brightens when slowing and fades smoothly on release',()=>{
    const on=brakeGlow(0,-20,0.1,40);expect(on).toBeGreaterThan(0.7);expect(on).toBeLessThan(1);
    expect(brakeGlow(on,0,0.1,40)).toBeLessThan(on);
    expect(brakeGlow(0,-20,0.1,0)).toBe(0);
  });
});
