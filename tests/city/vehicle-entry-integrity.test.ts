import {describe,it,expect} from 'vitest';
import {World} from '../../src/city/world';
import {emptyMap} from '../../src/city/map';
import {CIV} from '../../src/city/defs';

const make=()=>{const w=new World({seed:19,difficulty:'d4',klass:'warlord',tutorial:true});w.map=emptyMap();w.vehicles=[];return w;};
describe('LAST CITY vehicle entry ownership integrity',()=>{
  it('does not teleport a pedestrian referenced by a stale driver pointer',()=>{
    const w=make(),boss=w.boss(0)!,ped=w.spawnActor('civ',CIV,2000,2000);
    const car=w.spawnVehicle('sedan',boss.x,boss.y,0);
    const old={x:ped.x,y:ped.y};
    car.driver=ped.id;car.f=CIV;ped.inVeh=0;
    w.toggleVehicle(0);
    expect(boss.inVeh).toBe(car.id);expect(car.driver).toBe(boss.id);
    expect(ped.inVeh).toBe(0);expect(ped.x).toBe(old.x);expect(ped.y).toBe(old.y);
  });
  it('allows a boss to reclaim a free car with an obsolete boss-driver link',()=>{
    const w=make(),boss=w.boss(0)!,car=w.spawnVehicle('sedan',boss.x,boss.y,0);
    car.driver=boss.id;car.f=0;boss.inVeh=0;
    w.toggleVehicle(0);
    expect(boss.inVeh).toBe(car.id);expect(car.driver).toBe(boss.id);
  });
});
