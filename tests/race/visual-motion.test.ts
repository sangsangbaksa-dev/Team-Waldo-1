import { describe, expect, it } from 'vitest';
import { emissionCount, motionWeight, presentationFov } from '../../src/race/application/visual-motion';

describe('race presentation timing', () => {
  it('emits the same total at 30, 60 and 120 Hz with integral rates', () => {
    for (const hz of [30, 60, 120]) {
      let total = 0;
      for (let i = 0; i < hz; i++) total += emissionCount(120, 1 / hz, 0.5);
      expect(total).toBe(120);
    }
  });
  it('bounds emissions after a stalled frame and handles fractional rates', () => {
    expect(emissionCount(120, 2, 0.5)).toBe(12);
    expect(emissionCount(30, 1 / 60, 0.25)).toBe(1);
    expect(emissionCount(30, 1 / 60, 0.75)).toBe(0);
  });
  it('keeps exponential motion stable across frame rates', () => {
    expect(1 - motionWeight(1 / 30, 8)).toBeCloseTo((1 - motionWeight(1 / 60, 8)) ** 2);
    expect(presentationFov(100, false)).toBe(90);
    expect(presentationFov(100, true)).toBe(72);
  });
});
