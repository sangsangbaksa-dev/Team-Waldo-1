import {describe,it,expect} from 'vitest';
import {compactAlive,World} from '../../src/city/world';
import {lightVehicleCapacity} from '../../src/city/traffic-lighting';

describe('LAST CITY continuous-play entity lifetime',()=>{
  it('reuses array storage and maintains insertion order after death',()=>{
    const a=[{id:1,alive:true},{id:2,alive:false},{id:3,alive:true},{id:4,alive:false}];
    const ref=a;expect(compactAlive(a)).toBe(2);
    expect(a).toBe(ref);expect(a.map(x=>x.id)).toEqual([1,3]);
    expect(compactAlive(a)).toBe(0);expect(a).toBe(ref);
  });
  it('handles empty and fully expired batches without retaining removed objects',()=>{
    const none: Array<{alive:boolean}>=[];
    expect(compactAlive(none)).toBe(0);
    const all=[{alive:false},{alive:false}];
    expect(compactAlive(all)).toBe(2);expect(all).toHaveLength(0);
  });
  it('preserves world collection identities across 30-Hz simulation ticks',()=>{
    const w=new World({seed:13,difficulty:'d4',klass:'warlord',tutorial:true});
    const vehicles=w.vehicles,loot=w.loot,structures=w.structures;
    const dead=w.spawnVehicle('sedan',400,400,0);
    const drop=w.spawnLoot('cash',450,450,25);
    dead.alive=false;drop.alive=false;
    w.step(1/30);
    expect(w.vehicles).toBe(vehicles);expect(w.loot).toBe(loot);expect(w.structures).toBe(structures);
    expect(vehicles).not.toContain(dead);expect(loot).not.toContain(drop);
  });
  it('allocates all dry-night lights and reserves brake slots only for wet roads',()=>{
    expect(lightVehicleCapacity(12,0)).toBe(12);
    expect(lightVehicleCapacity(12,0.25)).toBe(12);
    expect(lightVehicleCapacity(12,0.26)).toBe(6);
    expect(lightVehicleCapacity(11,1)).toBe(5);
    expect(lightVehicleCapacity(0,1)).toBe(0);
    expect(lightVehicleCapacity(NaN,0)).toBe(0);
  });
});
