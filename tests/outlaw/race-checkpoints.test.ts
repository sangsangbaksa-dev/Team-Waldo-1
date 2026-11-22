import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/outlaw/sim';
import { selectRaceCheckpoints } from '../../src/outlaw/activities';

describe('OUTLAW street race route selection', () => {
  it('constructs a safe six-checkpoint loop without allocating sorted candidate arrays', () => {
    for (const seed of [7, 13, 19]) {
      const sim = new Sim(seed);
      const v = sim.spawnVehicle('sports', sim.player.x, sim.player.z, 0);
      const points = selectRaceCheckpoints(sim, v);
      expect(points, `seed ${seed}`).toHaveLength(6);
      expect(Math.hypot(points[0].x-v.x, points[0].z-v.z)).toBeLessThan(45);
      for (let i = 1; i < points.length; i++) {
        const dist = Math.hypot(points[i].x-points[i-1].x, points[i].z-points[i-1].z);
        expect(dist).toBeGreaterThanOrEqual(89.999);
        expect(dist).toBeLessThanOrEqual(200.001);
      }
      const closing = Math.hypot(points[5].x-points[0].x,points[5].z-points[0].z);
      expect(closing).toBeGreaterThanOrEqual(89.999);
      expect(closing).toBeLessThanOrEqual(200.001);
    }
  });
});
