import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { stepVehicle } from '../../src/outlaw/vehicle';

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
