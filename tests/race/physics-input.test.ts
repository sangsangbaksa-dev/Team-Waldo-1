import { describe, expect, it } from 'vitest';
import { buildTrack } from '../../src/race/track';
import { newCar, safeDriveControl, stepCar } from '../../src/race/physics';

const track = buildTrack(), DT = 1 / 90;
const idle = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };

describe('SPEED RUSH defensive input and boost-pad physics', () => {
  it('clamps analog pedals and steering without changing valid input values', () => {
    expect(safeDriveControl(0.3)).toBe(0.3);
    expect(safeDriveControl(2)).toBe(1);
    expect(safeDriveControl(-4)).toBe(0);
    expect(safeDriveControl(3, true)).toBe(1);
    expect(safeDriveControl(-3, true)).toBe(-1);
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(safeDriveControl(bad)).toBe(0);
      expect(safeDriveControl(bad, true)).toBe(0);
    }
  });

  it('does not mutate vehicle state during invalid or backwards simulation ticks', () => {
    const c = newCar(track, 0, 0), initial = structuredClone(c);
    for (const dt of [NaN, Infinity, -Infinity, 0, -1]) {
      expect(stepCar(c, { ...idle, throttle: 1 }, dt, track)).toEqual({ hit: 0, driftBoost: 0, pad: false });
      expect(c).toEqual(initial);
    }
  });

  it('treats malformed analog data as neutral, not as NaN acceleration', () => {
    const bad = newCar(track, 20, 0), neutral = newCar(track, 20, 0);
    stepCar(bad, { ...idle, throttle: NaN, brake: Infinity, steer: NaN }, DT, track);
    stepCar(neutral, idle, DT, track);
    expect(bad).toEqual(neutral);
    const clamped = newCar(track, 20, 0), normal = newCar(track, 20, 0);
    stepCar(clamped, { ...idle, throttle: 2, brake: -10, steer: 8 }, DT, track);
    stepCar(normal, { ...idle, throttle: 1, brake: 0, steer: 1 }, DT, track);
    expect(clamped).toEqual(normal);
  });

  it('does not award stationary pad boosts repeatedly, but triggers when passing forward', () => {
    const pad = track.pads[0], stationary = newCar(track, pad, 0);
    expect(stepCar(stationary, idle, DT, track).pad).toBe(false);
    expect(stationary.boostT).toBe(0);
    const moving = newCar(track, pad, 0);
    moving.vx = Math.cos(moving.h) * 12; moving.vz = Math.sin(moving.h) * 12; moving.vf = 12;
    expect(stepCar(moving, idle, DT, track).pad).toBe(true);
    expect(moving.boostT).toBeGreaterThan(0);
  });
});
