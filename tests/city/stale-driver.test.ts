import {describe,it,expect} from 'vitest';
import {World} from '../../src/city/world';
import {emptyMap} from '../../src/city/map';
import {updateVehicles} from '../../src/city/actors';

describe('LAST CITY stale driver link regression',()=>{
  it('does not grant player throttle to a car with an invalid occupant link',()=>{
    const w=new World({seed:11,difficulty:'d4',klass:'warlord',tutorial:true});
    w.map=emptyMap();w.vehicles=[];
    const boss=w.boss(0)!,car=w.spawnVehicle('sedan',600,600,0);
    // Car still points at the boss, but the boss no longer occupies it.
    car.driver=boss.id;car.f=0;boss.inVeh=0;
    w.input={mx:1,my:0,ax:650,ay:600,fire:false,dash:false,brake:false};
    updateVehicles(w,1/30);
    expect(car.driver).toBe(0);
    expect(car.f).toBe(-1);
    expect(car.throttle).toBe(0);
    expect(car.vx).toBe(0);
  });
});
