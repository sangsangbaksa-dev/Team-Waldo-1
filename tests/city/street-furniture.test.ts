import {describe,expect,it} from 'vitest';
import {parkFurniture,startFurniture} from '../../src/shared/street-furniture';
import {generateCity,makeRng} from '../../src/city/map';
import {buildTrack} from '../../src/race/track';
import {MAPS} from '../../src/race/maps';
describe('reused street furniture',()=>{
  it('keeps benches outside tree and solid footprints',()=>{
    const map=generateCity(makeRng(17)),items=parkFurniture(map,'high');expect(items.length).toBeGreaterThan(0);
    expect(parkFurniture(map,'low').length).toBeLessThanOrEqual(items.length);
    for(const p of items){
      expect(map.trees.every(t=>Math.hypot(t.x-p.x,t.y-p.z)>=37+t.r)).toBe(true);
      expect(map.solids.every(s=>!s.alive||p.x+37<=s.x||p.x-37>=s.x+s.w||p.z+37<=s.y||p.z-37>=s.y+s.h)).toBe(true);
    }
  });
  it('keeps racing shelters out of the road on every circuit',()=>{
    for(const map of MAPS){
      const t=buildTrack(map.points,map.halfWidth);
      for(const p of startFurniture(t,false))expect(t.x.every((x,j)=>Math.hypot(x-p.x,t.z[j]-p.z)>=t.halfWidth+2)).toBe(true);
    }
  });
});
