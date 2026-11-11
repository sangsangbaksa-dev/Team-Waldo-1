import { describe, expect, it } from 'vitest';
import { createRng, next, nextInt } from '../../src/sim/rng';

describe('rng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(next(a)).toBe(next(b));
  });

  it('값은 [0, 1) 범위다', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = next(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(nextInt(r, 5)).toBeLessThan(5);
    }
  });
});
