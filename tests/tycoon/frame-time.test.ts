import { describe, expect, it } from 'vitest';
import { animatedDelta } from '../../src/tycoon/frame-time';

describe('HUSTLE scene and economy pause consistency', () => {
  it('freezes both world and simulation for menus and hidden play tabs', () => {
    for (const dt of [1/60, .05, .1]) {
      expect(animatedDelta(dt, true, true, false)).toBe(0);
      expect(animatedDelta(dt, true, false, true)).toBe(0);
      expect(animatedDelta(dt, true, true, true)).toBe(0);
    }
  });
  it('keeps animated title and gameplay active when visible', () => {
    expect(animatedDelta(1/60, true, false, false)).toBeCloseTo(1/60);
    expect(animatedDelta(1/60, false, false, false)).toBeCloseTo(1/60);
    expect(animatedDelta(1/60, false, true, false)).toBeCloseTo(1/60);
    expect(animatedDelta(1/60, false, false, true)).toBe(0);
  });
  it('never feeds negative, nonfinite or tab-suspension spikes into world clocks', () => {
    for (const n of [NaN, Infinity, -Infinity, 0, -1]) expect(animatedDelta(n, true, false, false)).toBe(0);
    expect(animatedDelta(5, true, false, false)).toBe(.1);
  });
});
