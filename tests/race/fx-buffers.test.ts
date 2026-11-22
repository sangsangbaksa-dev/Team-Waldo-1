import {describe,expect,it} from 'vitest';
import {writeVec3,writeSpeedStreak,streakDirection,speedStreakBudget,raceFxBudget} from '../../src/race/fx-buffers';
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

describe('SPEED RUSH speed-line quality and motion budgets',()=>{
  it('reserves fewer line vertices for low-end devices',()=>{
    expect(speedStreakBudget('high',false)).toBe(220);
    expect(speedStreakBudget('standard',false)).toBe(144);
    expect(speedStreakBudget('low',false)).toBe(72);
  });
  it('allocates no speed-line vertices when reduced motion is enabled',()=>{
    for(const q of ['high','standard','low'] as const)expect(speedStreakBudget(q,true)).toBe(0);
  });
});

describe('SPEED RUSH particle and tire trail allocation tiers',()=>{
  it('reduces low-quality scratch and trail buffers',()=>{
    const low=raceFxBudget('low'),high=raceFxBudget('high');
    expect(low.sparks).toBeLessThan(high.sparks);
    expect(low.smoke).toBeLessThan(high.smoke);
    expect(low.skids).toBeLessThan(high.skids);
    expect(high).toEqual(raceFxBudget('standard'));
  });
  it('retains enough space for more than one racer on low graphics',()=>{
    const b=raceFxBudget('low');
    expect(b.sparks).toBeGreaterThan(40);
    expect(b.smoke).toBeGreaterThan(40);
    expect(b.skids).toBeGreaterThan(150);
  });
});
