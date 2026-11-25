import { describe, expect, it } from 'vitest';
import { cameraClearance, easeCameraDistance } from '../../src/tycoon/scene/camera-motion';

describe('Hustle camera clearance', () => {
  it('samples near walls and the exact end of the desired camera ray', () => {
    expect(cameraClearance(7.6, d => d >= 7.5)).toBeLessThan(7.5);
    expect(cameraClearance(7.6, d => d >= 0.4)).toBeLessThan(0.4);
    expect(cameraClearance(7.6, () => false)).toBe(7.6);
  });
  it('contracts immediately and extends smoothly without overshooting', () => {
    expect(easeCameraDistance(7, 2, 1 / 60)).toBe(2);
    const next = easeCameraDistance(2, 7, 1 / 60);
    expect(next).toBeGreaterThan(2);
    expect(next).toBeLessThan(7);
    expect(easeCameraDistance(next, 7, 1 / 60)).toBeCloseTo(easeCameraDistance(2, 7, 1 / 30));
  });
});
