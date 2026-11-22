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

describe('OUTLAW low-allocation simulation input lifecycle', () => {
  it('retains a stable copied input object while clamping invalid controller values', () => {
    const sim = new Sim(149), input = sim.player.input;
    const pressed = { ...blankPedInput(), mx: 20, mz: -20, yaw: Infinity, pitch: -99, slot: 500, sprint: true, fire: true, enter: false };
    sim.step(1 / 60, pressed, blankCarInput());
    expect(sim.player.input).toBe(input);
    expect(input.mx).toBe(1); expect(input.mz).toBe(-1);
    expect(input.pitch).toBe(-1.2); expect(input.slot).toBe(-1);
    expect(input.fire).toBe(true);
    pressed.mx = 0;
    expect(input.mx).toBe(1);
    sim.step(1 / 60, blankPedInput(), blankCarInput());
    expect(sim.player.input).toBe(input);
    expect(input.fire).toBe(false);
    expect(input.sprint).toBe(false);
    expect(input.mx).toBe(0);
  });
  it('reuses the driven car control input without leaking external mutations', () => {
    const sim = new Sim(151), p = sim.player;
    const v = sim.spawnVehicle('sedan', p.x + 2, p.z, 0);
    expect(sim.enterVehicle(p, v)).toBe(true);
    const inputs = v.input, carInput = { ...blankCarInput(), throttle: 9, brake: -2, steer: Infinity, horn: true };
    sim.step(1/60, blankPedInput(), carInput);
    expect(v.input).toBe(inputs);
    expect([inputs.throttle,inputs.brake,inputs.steer,inputs.horn]).toEqual([1,0,0,true]);
    carInput.horn = false;
    expect(v.input.horn).toBe(true);
    sim.step(1/60, blankPedInput(), blankCarInput());
    expect(v.input).toBe(inputs);
    expect(v.input.horn).toBe(false);
  });
  it('removes adjacent expired corpses without skipping survivors', () => {
    const sim = new Sim(153);
    const dead = Array.from({ length: 3 }, (_, i) => sim.spawnPed('civ',sim.player.x + 10 + i,sim.player.z,{}));
    for (const p of dead) { p.alive = false; p.diedAt = -50; }
    const living = sim.spawnPed('civ',sim.player.x + 20,sim.player.z);
    sim.step(1/60,blankPedInput(),blankCarInput());
    for (const p of dead) expect(sim.ped(p.id)).toBeUndefined();
    expect(sim.ped(living.id)).toBe(living);
    expect(sim.ped(sim.player.id)).toBe(sim.player);
  });
});

describe('OUTLAW stable projectile and fire cleanup', () => {
  it('retains the projectile array identity and discards exploded grenades', () => {
    const sim = new Sim(157);
    const arr = sim.projectiles;
    sim.projectiles.push({ id: 9001, kind:'grenade',x:sim.player.x+100,y:1,z:sim.player.z,
      vx:0,vy:0,vz:0,owner:0,life:.001 });
    sim.step(1/60,blankPedInput(),blankCarInput());
    expect(sim.projectiles).toBe(arr);
    expect(sim.projectiles.some(q=>q.id===9001)).toBe(false);
    sim.step(1/60,blankPedInput(),blankCarInput());
    expect(sim.projectiles).toBe(arr);
  });
  it('removes adjacent expired wrecks in place without skipping vehicles', () => {
    const sim = new Sim(159), arr = sim.vehicles;
    const wrecks = Array.from({length:3},(_,i) => sim.spawnVehicle('sedan',
      sim.player.x+60+i*15,sim.player.z+35,0));
    for(const v of wrecks){v.wrecked=true;v.alive=false;v.burn=0;v.timer=100;}
    sim.step(1/60,blankPedInput(),blankCarInput());
    expect(sim.vehicles).toBe(arr);
    for(const v of wrecks) expect(sim.vehicle(v.id)).toBeUndefined();
  });
});
