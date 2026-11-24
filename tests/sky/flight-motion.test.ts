import { describe, expect, it } from 'vitest';
import { dampingAlpha, emissionChance, flightCameraFov, impactOffset } from '../../src/sky/flight-motion';

describe('flight presentation motion', () => {
  it('uses frame-rate independent damping', () => {
    const full = dampingAlpha(7, 1 / 30);
    const half = dampingAlpha(7, 1 / 60);
    expect(full).toBeCloseTo(1 - (1 - half) ** 2, 12);
    expect(dampingAlpha(7, 0)).toBe(0);
  });
  it('bounds emission probability for long frames', () => {
    expect(emissionChance(24, 0)).toBe(0);
    expect(emissionChance(24, 1)).toBeGreaterThan(0.99);
    expect(emissionChance(24, 100)).toBeLessThanOrEqual(1);
  });
  it('uses a fixed field of view and no impact offset in reduced motion', () => {
    expect(flightCameraFov(false, 230, 1, true)).toBe(62);
    expect(flightCameraFov(true, 230, 1, true)).toBe(70);
    expect(impactOffset(1, 1, true)).toEqual({ x: 0, y: 0 });
  });
  it('limits boost FOV and keeps camera impact deterministic', () => {
    expect(flightCameraFov(false, 900, 5, false)).toBe(76);
    expect(flightCameraFov(false, 0, 0, false)).toBe(58);
    const offset = impactOffset(1.25, 4, false);
    expect(offset).toEqual(impactOffset(1.25, 4, false));
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(0.6);
  });
});
