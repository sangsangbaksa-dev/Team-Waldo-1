import {describe,expect,it} from 'vitest';
import {facadeFins,facadeStyle} from '../../src/city/architecture-detail';
describe('LAST CITY facade detail budget',()=>{
  it('omits details on low settings and narrow/service faces',()=>{
    expect(facadeFins(300,400,0,'low')).toEqual([]);
    expect(facadeFins(40,400,0,'high')).toEqual([]);
    expect(facadeFins(300,400,3,'high')).toEqual([]);
  });
  it('keeps ribs inside walls and limits geometry density',()=>{
    for(const style of [0,1,2,3,4]) for(const length of [72,140,280,440]){
      const fins=facadeFins(length,400,style,'high');
      expect(fins.length).toBeLessThanOrEqual(5);
      for(const f of fins){expect(f.at-f.width/2).toBeGreaterThan(0);expect(f.at+f.width/2).toBeLessThan(length);}
      expect(facadeFins(length,400,style,'standard').length).toBeLessThanOrEqual(fins.length);
    }
  });
});

it('uses recognizable landmark styles regardless of random seed',()=>{
  expect(facadeStyle('bank','BANK',0.42,0.9)).toBe(2);
  expect(facadeStyle('plant',undefined,0.4,0.2)).toBe(3);
  expect(facadeStyle(undefined,'ARMY',0.14,0.1)).toBe(3);
  expect(facadeStyle(undefined,undefined,0.3,0.7)).toBe(3);
});
