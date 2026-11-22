import {describe,expect,it} from 'vitest';
import {nearbyVehicleLights,frameEmissionChance} from '../../src/city/traffic-lighting';
const v=(id:number,x:number,y:number,alive=true,driver=1,burn=0)=>({id,x,y,alive,driver,burn});
describe('LAST CITY traffic lighting budgets',()=>{
  it('keeps only eligible nearby cars ordered by squared distance',()=>{
    const fleet=[v(1,50,0),v(2,5,0),v(3,3,0,false),v(4,1,0,true,1),v(5,20,0,true,1,1),v(6,1e4,0),v(7,10,0)];
    expect(nearbyVehicleLights(fleet,0,0,100,3).map(x=>x.id)).toEqual([4,2,7]);
  });
  it('uses a bounded reusable result array and drops distant results on the next frame',()=>{
    const out: ReturnType<typeof v>[]=[];
    const fleet=Array.from({length:1000},(_,i)=>v(i,i,0));
    expect(nearbyVehicleLights(fleet,0,0,500,7,out)).toBe(out);
    expect(out.map(x=>x.id)).toEqual([0,1,2,3,4,5,6]);
    nearbyVehicleLights(fleet,9000,9000,100,7,out);
    expect(out).toEqual([]);
  });
  it('does not select missing drivers, burnt, or invalid coordinates',()=>{
    const fleet=[v(1,0,0,true,0),v(2,0,0,true,1,1),v(3,NaN,0),v(4,1,0)];
    expect(nearbyVehicleLights(fleet,0,0,5,10).map(x=>x.id)).toEqual([4]);
    expect(nearbyVehicleLights(fleet,NaN,0,5,10)).toHaveLength(0);
  });
  it('matches frame-rate-independent particle rates and rejects invalid values',()=>{
    expect(frameEmissionChance(17,1/30)).toBeCloseTo(1-(1-frameEmissionChance(17,1/60))**2,10);
    expect(frameEmissionChance(17,0)).toBe(0);
    expect(frameEmissionChance(Infinity,0.016)).toBe(0);
  });
});
