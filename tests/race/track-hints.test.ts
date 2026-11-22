import {describe,expect,it} from 'vitest';
import {MAPS} from '../../src/race/maps';
import {buildMapTrack,buildTrack,nearest} from '../../src/race/track';

describe('SPEED RUSH track sampling and hint resilience',()=>{
  it.each(MAPS.map(m=>[m.id,m] as const))('%s gives bounded nearest-index results for wrapped hints',(_name,map)=>{
    const track=buildMapTrack(map);
    for(const hint of [-10*track.n,-track.n-7,0,track.n*20+7,NaN,Infinity]){
      const found=nearest(track,track.x[10],track.z[10],hint,40);
      expect(found.i).toBeGreaterThanOrEqual(0);
      expect(found.i).toBeLessThan(track.n);
      expect([found.lat,found.dist].every(Number.isFinite)).toBe(true);
    }
  });
  it('preserves centerline geometry independently of readonly spline controls',()=>{
    const points=MAPS[0].points;
    const prev=points.map(p=>[...p]);
    const one=buildTrack(points),two=buildTrack(points);
    expect(Array.from(one.x)).toEqual(Array.from(two.x));
    expect(Array.from(one.z)).toEqual(Array.from(two.z));
    expect(Array.from(one.y)).toEqual(Array.from(two.y));
    expect(points).toEqual(prev);
  });
});
