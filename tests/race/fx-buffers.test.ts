import {describe,expect,it} from 'vitest';
import {writeVec3,writeSpeedStreak,streakDirection} from '../../src/race/fx-buffers';
describe('SPEED RUSH hot-loop GPU buffer writes',()=>{
  it('writes only the target particle slot',()=>{
    const data=new Float32Array(9).fill(-1);
    writeVec3(data,1,10,20,30);
    expect(Array.from(data)).toEqual([-1,-1,-1,10,20,30,-1,-1,-1]);
    writeVec3(data,1,0,1,2);
    expect(Array.from(data.slice(3,6))).toEqual([0,1,2]);
  });
  it('builds streak vertex pairs without overwriting their neighbors',()=>{
    const data=new Float32Array(18).fill(-1);
    writeSpeedStreak(data,1,4,5,6,0.6,0.8,10);
    expect(Array.from(data.slice(6,12))).toEqual([4,5,6,10,5,14]);
    expect(data.slice(0,6).every(x=>x===-1)).toBe(true);
    expect(data.slice(12).every(x=>x===-1)).toBe(true);
  });
  it('normalizes drifting velocity instead of distorting streak length',()=>{
    const d=streakDirection(3,4);
    expect(d.x).toBeCloseTo(.6);expect(d.z).toBeCloseTo(.8);
    expect(Math.hypot(d.x,d.z)).toBeCloseTo(1);
    expect(streakDirection(0,0)).toEqual({x:1,z:0});
    expect(streakDirection(NaN,4)).toEqual({x:1,z:0});
  });
});
