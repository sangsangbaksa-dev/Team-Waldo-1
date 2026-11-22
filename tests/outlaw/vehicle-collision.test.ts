import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { stepVehicle, collideVehicles, autoDrive } from '../../src/outlaw/vehicle';

describe('vehicle broadphase order and lifetime', () => {
  it('detects a moving newer vehicle hitting an older stationary vehicle after its turn', () => {
    const s = new Sim(7);
    for (const v of [...s.vehicles]) s.removeVehicle(v);
    const older = s.spawnVehicle('sedan', 0, 0, 0), newer = s.spawnVehicle('sedan',-4.75,0,0,{vx:10,vf:10});
    stepVehicle(s, older, .1); stepVehicle(s, newer, .1);
    expect(older.vx).toBeGreaterThan(0);
    expect(newer.x).toBeLessThan(older.x-4.69);
  });
  it('ignores a vehicle removed from the simulation after the frame grid was built', () => {
    const s = new Sim(7);
    for (const v of [...s.vehicles]) s.removeVehicle(v);
    const removed = s.spawnVehicle('sedan',0,0,0), mover = s.spawnVehicle('sedan',-4.75,0,0,{vx:10,vf:10});
    stepVehicle(s, removed,.1);s.removeVehicle(removed);stepVehicle(s,mover,.1);
    expect(mover.x).toBeGreaterThan(-4.69);expect(removed.vx).toBe(0);
  });
});

it('reuses the spatial grid safely across frames, including vehicle removal and respawn', () => {
  const sim = new Sim(22);
  const first = sim.spawnVehicle('sedan', -4.85, 0, 0, { vx: 8, mode: 'none' });
  let other = sim.spawnVehicle('sedan', 0, 0, 0, { mode: 'none' });
  for (let i = 0; i < 120; i++) {
    sim.frame++;
    stepVehicle(sim, first, 1/60);
    if (i === 30) {
      sim.removeVehicle(other);
      other = sim.spawnVehicle('sedan', 10, 0, 0, { mode: 'none' });
    }
    stepVehicle(sim, other, 1/60);
    expect([first.x, first.z, other.x, other.z].every(Number.isFinite)).toBe(true);
  }
  expect(sim.vehicle(other.id)).toBe(other);
  expect(sim.vehicles).not.toContainEqual(expect.objectContaining({ id: other.id - 1 }));
});

describe('OUTLAW rotated vehicle collision SAT regression', () => {
  it('separates crossed vehicle hulls without changing elevation or corrupting velocities', () => {
    const sim = new Sim(31);
    const a = sim.spawnVehicle('sedan', 0, 0, Math.PI / 4, { vx: 5 });
    const b = sim.spawnVehicle('sedan', 2, 0, -Math.PI / 4, { vx: -5 });
    collideVehicles(sim, a, b);
    expect([a.x,a.z,b.x,b.z,a.vx,a.vz,b.vx,b.vz].every(Number.isFinite)).toBe(true);
    expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeGreaterThan(2);
    expect(a.y).toBe(0); expect(b.y).toBe(0);
  });
  it('does not collide vehicles that are separated on one of their own axes', () => {
    const sim = new Sim(32);
    const a = sim.spawnVehicle('sedan', 0, 0, Math.PI/4, { vx: 5 });
    const b = sim.spawnVehicle('sedan', 10, 0, -Math.PI/4);
    collideVehicles(sim,a,b);
    expect([a.x,a.z,b.x,b.z]).toEqual([0,0,10,0]);
  });
});

describe('OUTLAW AI vehicle steering safety', () => {
  it('does not pass nonfinite mission waypoints through to physical controls', () => {
    const sim = new Sim(77), v = sim.spawnVehicle('sedan', 0, 0, 0);
    v.input.throttle = 1;
    autoDrive(sim, v, Infinity, 0, 20, .016);
    expect(v.input.throttle).toBe(0);
    expect(v.input.brake).toBe(1);
    expect(v.input.handbrake).toBe(true);
    autoDrive(sim, v, 10, 0, NaN, .016);
    expect([v.input.throttle, v.input.brake, v.input.steer].every(Number.isFinite)).toBe(true);
  });
  it('keeps steering controls finite for a valid open-road destination', () => {
    const sim = new Sim(78), v = sim.spawnVehicle('sedan', sim.player.x, sim.player.z, 0);
    autoDrive(sim, v, sim.player.x + 40, sim.player.z, 12, .016);
    expect([v.input.throttle, v.input.brake, v.input.steer].every(Number.isFinite)).toBe(true);
    expect(v.input.throttle).toBeGreaterThanOrEqual(0);
  });
});
