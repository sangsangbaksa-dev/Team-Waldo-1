import { describe, expect, it } from 'vitest';
import { BODY_HALF_WIDTH, stayOnTrack } from '../../src/race/physics';
import { createRace, updateRace } from '../../src/race/race';
import { buildTrack } from '../../src/race/track';

const t = buildTrack(), DT = 1 / 90;
const idle = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };

describe('SPEED RUSH collision-only road reprojection', () => {
  it('clamps a car that is pushed beyond the outside wall by an overlap', () => {
    const r = createRace(t, 1);
    r.phase = 'racing'; r.clock = 8;
    const i = 100, limit = t.halfWidth - BODY_HALF_WIDTH - 0.28;
    const nx = -t.tz[i], nz = t.tx[i];
    const [a, b] = [r.player.car, r.racers[1].car];
    for (const [car, lat] of [[a, limit - 0.1], [b, limit - 0.3]] as const) {
      car.idx = i; car.x = t.x[i] + nx * lat; car.z = t.z[i] + nz * lat;
      car.y = t.y[i]; car.h = Math.atan2(t.tz[i], t.tx[i]);
      car.vx = car.vz = car.vf = car.vl = 0;
    }
    updateRace(r, DT, idle);
    expect(Math.abs(a.lat)).toBeLessThanOrEqual(limit + 1e-3);
    expect(Math.abs(b.lat)).toBeLessThanOrEqual(limit + 1e-3);
    expect(Number.isFinite(a.x) && Number.isFinite(a.z)).toBe(true);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1);
  });

  it('a solo car has no remaining road correction after its normal step', () => {
    const r = createRace(t, 1, Infinity, { trial: true });
    r.phase = 'racing'; r.clock = 5;
    for (let k = 0; k < 100; k++) updateRace(r, DT, idle);
    const c = r.player.car;
    const before = { x: c.x, z: c.z, lat: c.lat, idx: c.idx, vx: c.vx, vz: c.vz };
    expect(stayOnTrack(c, t, DT, false)).toBe(0);
    expect({ x: c.x, z: c.z, lat: c.lat, idx: c.idx, vx: c.vx, vz: c.vz }).toEqual(before);
  });
});
