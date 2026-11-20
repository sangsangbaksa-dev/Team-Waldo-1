import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { blankPedInput, blankCarInput, wrapAngle } from '../../src/outlaw/types';
import { MISSION_LIST } from '../../src/outlaw/missions';
import { stepVehicle } from '../../src/outlaw/vehicle';

describe('OUTLAW state and simulation edge cases', () => {
  it('filters unknown collectible, stunt and mission IDs and clamps invented property income', () => {
    const s = new Sim(7); s.applySave({v:1,stunts:[0,999],collected:[0,999],completed:[MISSION_LIST[0].id,'fake'],life:{propBank:999999}});
    expect(s.activity.stunts).toEqual([0]); expect([...s.collected]).toEqual([0]); expect(s.mission.completed).toEqual([MISSION_LIST[0].id]); expect(s.life.propBank).toBe(0);
  });
  it('bounds stars, counters and invalid numeric input', () => {
    const s = new Sim(7); s.setStars(500); expect(s.wanted.stars).toBe(5); s.setStars(NaN); expect(s.wanted.stars).toBe(5);
    s.count('test',NaN); s.count('test',-10); expect(s.life.counters.test).toBeUndefined();
    s.count('test',Number.MAX_SAFE_INTEGER);s.count('test',10);expect(s.life.counters.test).toBe(Number.MAX_SAFE_INTEGER);
    expect(wrapAngle(Infinity)).toBe(0); expect(Number.isFinite(wrapAngle(1e100))).toBe(true);
    s.step(100,{...blankPedInput(),mx:NaN,yaw:Infinity,pitch:NaN},blankCarInput());
    expect(s.t).toBe(.25);expect([s.player.x,s.player.y,s.player.z,s.player.yaw].every(Number.isFinite)).toBe(true);
  });
  it('rejects deleted vehicles and clears the player seat safely on despawn', () => {
    const s = new Sim(7); const p = s.player, v = s.spawnVehicle('sedan',p.x+2,p.z,0);
    expect(s.enterVehicle(p,v)).toBe(true);s.removeVehicle(v);expect(p.vehicle).toBe(0);expect(p.seat).toBe(0);expect(s.enterVehicle(p,v)).toBe(false);
    expect(s.drain().some(e=>e.t==='exit')).toBe(true);
  });
  it('does not allow nearby vehicle selection across a large height difference', () => {
    const s=new Sim(7),p=s.player; s.spawnVehicle('sedan',p.x,p.z,0,{y:p.y+10});expect(s.nearestVehicle(p)).toBeNull();
  });
  it('keeps vehicles inside world bounds', () => {
    const s=new Sim(7),v=s.spawnVehicle('sedan',s.map.half-1,0,0,{vx:20});
    stepVehicle(s,v,.1);expect(v.x).toBeLessThan(s.map.half-2);expect(v.vx).toBeLessThanOrEqual(0);
  });
});
