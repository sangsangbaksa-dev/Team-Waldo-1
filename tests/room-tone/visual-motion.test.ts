import { describe, expect, it } from 'vitest';
import { damp, dampAngle, lampDip, portraitDistance, walkingMotion } from '../../src/room-tone/visual-motion.mjs';

describe('recording facility presentation motion', () => {
  it('turns the short way across the angle wrap', () => {
    const angle = dampAngle(Math.PI - 0.02, -Math.PI + 0.02, 10, 0.1);
    expect(angle).toBeGreaterThan(Math.PI - 0.02);
    expect(angle).toBeLessThan(Math.PI + 0.02);
  });
  it('uses the same damping over the same elapsed time', () => {
    expect(damp(damp(0, 1, 12, 0.05), 1, 12, 0.05)).toBeCloseTo(damp(0, 1, 12, 0.1), 12);
  });
  it('advances the walking phase by distance, not by frame count', () => {
    const a = walkingMotion(0, 0, 0.188, 0.1, false, false, false);
    let b = walkingMotion(0, 0, 0.094, 0.05, false, false, false);
    b = walkingMotion(b.phase, b.amplitude, 0.094, 0.05, false, false, false);
    expect(a.phase).toBeCloseTo(b.phase, 12);
    expect(a.height).toBeCloseTo(b.height, 12);
  });
  it('disables walking bob and lamp fluctuations under reduced motion', () => {
    expect(walkingMotion(1, 1, 0.2, 0.1, true, false, true).height).toBe(0);
    expect(lampDip(0.09, 0.18, true)).toBe(1);
  });
  it('keeps light visible during the dip and returns to full intensity', () => {
    expect(lampDip(0, 0.18, false)).toBe(1);
    expect(lampDip(0.09, 0.18, false)).toBeCloseTo(0.48);
    expect(lampDip(0.18, 0.18, false)).toBe(1);
  });
  it('increases portrait distance for narrow screens without changing game logic', () => {
    const portrait = portraitDistance(0.5, 0.7, 0.4, 70, 0.84);
    const landscape = portraitDistance(0.5, 0.7, 1.8, 70, 0.84);
    expect(portrait).toBeGreaterThan(landscape);
    expect(landscape).toBeGreaterThan(0);
  });
});
