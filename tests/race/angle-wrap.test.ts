import { describe, expect, it } from 'vitest';
import { wrapAngle } from '../../src/race/physics';

const previousWrap = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

describe('SPEED RUSH angle wrapping', () => {
  it('keeps ordinary input values bit-for-bit unchanged', () => {
    for (const angle of [-Math.PI, -2.8, -0.5, -0, 0, 0.5, 2.8, Math.PI]) {
      expect(Object.is(wrapAngle(angle), angle)).toBe(true);
    }
  });

  it('agrees with the old iterative math on ordinary turns', () => {
    for (const angle of [-100, -19, -3 * Math.PI, -Math.PI - 0.01, Math.PI + 0.01, 3 * Math.PI, 19, 100]) {
      expect(wrapAngle(angle)).toBeCloseTo(previousWrap(angle), 11);
    }
    expect(wrapAngle(3 * Math.PI)).toBe(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBe(-Math.PI);
  });

  it('bounds huge values without an unbounded loop or NaN propagation', () => {
    for (const angle of [-1e24, -1e15, 1e15, 1e24]) {
      const result = wrapAngle(angle);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(-Math.PI);
      expect(result).toBeLessThanOrEqual(Math.PI);
    }
    for (const bad of [Infinity, -Infinity, NaN]) expect(wrapAngle(bad)).toBe(0);
  });
});
