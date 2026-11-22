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

describe('SPEED RUSH malformed track input safeguards',()=>{
  it('rejects incomplete, degenerate and nonfinite track definitions',()=>{
    const control=MAPS[0].points;
    expect(()=>buildTrack(control.slice(0,3))).toThrow(RangeError);
    expect(()=>buildTrack([[0,0,0],[0,0,0],[0,0,0],[0,0,0]])).toThrow(RangeError);
    expect(()=>buildTrack([[0,0,0],[1,0,0],[1,1,NaN],[0,1,0]])).toThrow(RangeError);
    expect(()=>buildTrack(control,0)).toThrow(RangeError);
    expect(()=>buildTrack(control,12,0)).toThrow(RangeError);
    expect(()=>buildTrack(control,12,1e-9)).toThrow(RangeError);
    expect(()=>buildTrack(control,12,100000)).toThrow(RangeError);
  });
  it('uses whole-circuit search for invalid nearest-point window values',()=>{
    const t=buildTrack(),a=nearest(t,t.x[8],t.z[8],100,NaN);
    expect(a.i).toBe(8);
    expect(a.dist).toBeCloseTo(0);
  });
});
