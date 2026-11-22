import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { stepTraffic } from '../../src/outlaw/traffic';

describe('OUTLAW traffic spatial index lifecycle', () => {
  it('keeps traffic update valid when vehicle membership changes between frames', () => {
    const sim = new Sim(13);
    for (let frame = 0; frame < 18; frame++) {
      sim.t += 0.1; sim.frame++;
      if (frame === 4) {
        const abandoned = sim.vehicles.find(v => v.mode === 'parked');
        if (abandoned) sim.removeVehicle(abandoned);
      }
      stepTraffic(sim, .1);
      const ids = sim.vehicles.map(v => v.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(sim.vehicles.every(v => Number.isFinite(v.x) && Number.isFinite(v.z))).toBe(true);
    }
  });
});

it('prunes distant vehicles during a reusable traffic snapshot without ghost occupants', () => {
  const sim = new Sim(117);
  const far = sim.map.half - 10;
  const cars = Array.from({length:3},(_,i) => sim.spawnVehicle('sedan',far-3*i,far-2*i,0,{mode:'parked'}));
  for(let step=0;step<3;step++){
    sim.t += .1;sim.frame++;
    stepTraffic(sim,.1);
  }
  for(const car of cars) expect(sim.vehicle(car.id)).toBeUndefined();
  expect(sim.vehicles.every(v => Number.isFinite(v.x) && Number.isFinite(v.z))).toBe(true);
});
