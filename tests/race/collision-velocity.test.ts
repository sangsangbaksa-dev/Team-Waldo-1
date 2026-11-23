import { describe, expect, it } from 'vitest';
import { BODY_HALF_WIDTH, kmh, newCar, separateCars, stayOnTrack } from '../../src/race/physics';
import { buildTrack } from '../../src/race/track';

const track = buildTrack();
const DT = 1 / 90;

describe('SPEED RUSH collision speed consistency', () => {
  it('updates the local speed and slip after a wall removes outward momentum', () => {
    const i = 70, c = newCar(track, i, track.halfWidth + 3);
    const tx = track.tx[i], tz = track.tz[i];
    c.vx = tx * 20 - tz * 12;
    c.vz = tz * 20 + tx * 12;
    c.vf = 20;
    c.vl = 12;
    stayOnTrack(c, track, DT, true);
    const fx = Math.cos(c.h), fz = Math.sin(c.h);
    expect(Math.abs(c.lat)).toBeLessThanOrEqual(track.halfWidth - BODY_HALF_WIDTH);
    expect(c.vf).toBeCloseTo(c.vx * fx + c.vz * fz, 6);
    expect(c.vl).toBeCloseTo(-c.vx * fz + c.vz * fx, 6);
    expect(c.slip).toBeCloseTo(Math.atan2(c.vl, Math.max(Math.abs(c.vf), 1)), 6);
    expect(kmh(c)).toBeCloseTo(Math.abs(c.vx * fx + c.vz * fz) * 3.6, 6);
  });

  it('updates both cars speedometers immediately after an impact', () => {
    const a = newCar(track, 50, 0), b = newCar(track, 50, 0);
    const tx = Math.cos(a.h), tz = Math.sin(a.h);
    b.x += tx * 2;
    b.z += tz * 2;
    a.vx = tx * 40;
    a.vz = tz * 40;
    a.vf = 40;
    const impulse = separateCars(a, b);
    expect(impulse).toBeGreaterThan(35);
    expect(a.vf).toBeCloseTo(a.vx * Math.cos(a.h) + a.vz * Math.sin(a.h), 6);
    expect(b.vf).toBeCloseTo(b.vx * Math.cos(b.h) + b.vz * Math.sin(b.h), 6);
    expect(a.vf).toBeLessThan(40);
    expect(b.vf).toBeGreaterThan(0);
  });
});
