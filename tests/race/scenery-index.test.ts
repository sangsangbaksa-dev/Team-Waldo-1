import {describe,it,expect} from 'vitest';
import {MAPS} from '../../src/race/maps';
import {buildTrack} from '../../src/race/track';
import {makeRng} from '../../src/city/map';
import {artSeed,ClearanceIndex} from '../../src/race/scenery-index';
describe('reproducible track scenery',()=>{
  it('keeps circuit seed stable but different between maps',()=>{
    const seeds=MAPS.map(m=>artSeed(buildTrack(m.points,m.halfWidth)));
    expect(new Set(seeds).size).toBe(MAPS.length);expect(artSeed(buildTrack(MAPS[0].points,MAPS[0].halfWidth))).toBe(seeds[0]);
    const a=makeRng(seeds[0]),b=makeRng(seeds[0]);expect(Array.from({length:20},a)).toEqual(Array.from({length:20},b));
  });
  it('matches brute-force clearance for hundreds of elevated-road positions',()=>{
    const rng=makeRng(619);
    for(const map of MAPS){
      const t=buildTrack(map.points,map.halfWidth),index=new ClearanceIndex(t);
      for(let n=0;n<180;n++){
        const i=Math.floor(rng()*t.n),x=t.x[i]+(rng()-.5)*380,z=t.z[i]+(rng()-.5)*380,r=10+rng()*150;
        const expected=!t.x.some((px,j)=>Math.hypot(px-x,t.z[j]-z)<r+Math.max(0,t.y[j]*2.4-2));
        expect(index.isClear(x,z,r)).toBe(expected);
      }
    }
  });
});
