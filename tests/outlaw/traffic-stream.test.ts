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
