import { describe, expect, it } from 'vitest';
import { newCar, recoverCar } from '../../src/race/physics';
import { buildTrack } from '../../src/race/track';

const t = buildTrack();

describe('SPEED RUSH recovery', () => {
  it('returns a car to the road and clears all motion without resetting race progress', () => {
    const c = newCar(t, 45, 10);
    c.total = t.n + 45; c.nitro = 0.8; c.boostT = 2.1; c.padCd = 0.6;
    c.vx = 27; c.vz = -8; c.vf = 20; c.vl = -4;
    c.steer = 0.8; c.slip = -0.4; c.yawRate = 1;
    c.drifting = true; c.driftT = 1.7; c.wallT = 0.3;
    c.draft = 0.9; c.nitroLit = true;
    recoverCar(c, t);
    expect(c.x).toBe(t.x[45]); expect(c.z).toBe(t.z[45]); expect(c.y).toBe(t.y[45]);
    expect(c.h).toBeCloseTo(Math.atan2(t.tz[45], t.tx[45]));
    for (const key of ['vx', 'vz', 'vf', 'vl', 'steer', 'slip', 'yawRate', 'lat', 'driftT', 'wallT', 'draft'] as const) {
      expect(c[key]).toBe(0);
    }
    expect(c.drifting).toBe(false);
    expect(c.nitroLit).toBe(false);
    expect(c.total).toBe(t.n + 45);
    expect(c.nitro).toBe(0.8);
    expect(c.boostT).toBe(2.1);
    expect(c.padCd).toBe(0.6);
  });
});
