import {describe,expect,it} from 'vitest';
import {compactLiveEffects} from '../../src/city/effect-lifetime';

describe('LAST CITY render-only effect array compaction',()=>{
  it('reuses the same array, retains order and removes expired entries',()=>{
    const a={life:0.3,id:1},b={life:-0.02,id:2},c={life:0.1,id:3};
    const effects=[a,b,c],identity=effects;
    expect(compactLiveEffects(effects)).toBe(2);
    expect(effects).toBe(identity);
    expect(effects).toEqual([a,c]);
    expect(compactLiveEffects(effects)).toBe(2);
    effects[0].life=-1;effects[1].life=0;
    expect(compactLiveEffects(effects)).toBe(0);
    expect(effects).toBe(identity);
    expect(effects).toEqual([]);
  });
  it('keeps capacity capped without stale dead entries blocking new effects',()=>{
    const effects=Array.from({length:58},(_,i)=>({id:i,life:i<12?0:0.5}));
    expect(compactLiveEffects(effects)).toBe(46);
    for(let i=0;i<12;i++)effects.push({id:58+i,life:0.25});
    expect(effects).toHaveLength(58);
    expect(effects[0].id).toBe(12);
  });
});
