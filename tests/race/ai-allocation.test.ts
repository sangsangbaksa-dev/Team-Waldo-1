import { describe, expect, it } from 'vitest';
import { aiInput, newCar, type AiProfile } from '../../src/race/physics';
import { buildTrack } from '../../src/race/track';
import { createRace, updateRace } from '../../src/race/race';

const t = buildTrack();
const ai: AiProfile = { lane: 2, top: 70, grip: 45, skill: 1, line: 0.6, nitro: 0.6 };
const idle = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };
describe('SPEED RUSH zero-allocation catchup AI', () => {
  it('preserves earlier acceleration decisions for normal and catch-up bands', () => {
    const car = newCar(t, 50, 2); car.vf = 46; car.vx = Math.cos(car.h) * 46; car.vz = Math.sin(car.h) * 46;
    for (const band of [0.7, 0.82, 1, 1.1, 1.25]) {
      expect(aiInput(car, t, ai, band)).toEqual(aiInput(car, t, { ...ai, top: ai.top * band, grip: ai.grip * band * band }));
    }
  });
  it('does not mutate immutable AI configuration when adjusting catch-up', () => {
    const car = newCar(t, 70, -3);
    const before = structuredClone(ai);
    for (let i = 0; i < 100; i++) aiInput(car, t, ai, i % 3 ? 0.8 : 1.1);
    expect(ai).toEqual(before);
  });
  it('keeps all three AI racers stable over simulated full-speed driving', () => {
    const r = createRace(t, 2);
    for (let i = 0; i < 90 * 8; i++) updateRace(r, 1 / 90, idle);
    for (const racer of r.racers) {
      expect([racer.car.x, racer.car.z, racer.car.vf, racer.car.h, racer.car.draft].every(Number.isFinite)).toBe(true);
      expect(racer.car.draft).toBeGreaterThanOrEqual(0);
      expect(racer.car.draft).toBeLessThanOrEqual(1);
    }
  });
});
