import {describe,expect,it} from 'vitest';
import {MAPS} from '../../src/race/maps';
import {buildMapTrack} from '../../src/race/track';
import {createRace,updateRace} from '../../src/race/race';

describe('SPEED RUSH full map coverage under realistic control changes',()=>{
  it.each(MAPS.map(m=>[m.id,m] as const))('%s preserves race physics across driving, braking and drifting',(_id,map)=>{
    const track=buildMapTrack(map),r=createRace(track,2,Infinity,{map:map.id});
    for(let i=0;i<90*12;i++){
      const control={
        throttle:i%340<270?1:0,
        brake:i%340>=270?.4:0,
        steer:Math.sin(i/100)*.8,
        drift:i%320>230&&i%320<300,
        nitro:i%240>90&&i%240<150
      };
      updateRace(r,1/90,control);
      if(i%90!==0)continue;
      for(const racer of r.racers){
        const c=racer.car;
        expect([c.x,c.z,c.y,c.h,c.vx,c.vz,c.vf,c.vl,c.total,c.nitro,c.boostT,c.draft].every(Number.isFinite)).toBe(true);
        expect(c.idx).toBeGreaterThanOrEqual(0);
        expect(c.idx).toBeLessThan(track.n);
        expect(c.nitro).toBeGreaterThanOrEqual(0);
        expect(c.nitro).toBeLessThanOrEqual(1);
      }
    }
  },45000);
});
