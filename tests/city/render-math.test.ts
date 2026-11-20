import { describe, expect, it } from 'vitest';
import { wrapNear, wrapRange } from '../../src/city/render-math';

describe('LAST CITY rain tiling', () => {
  it.each([0, 200, 12000, -12000])('keeps rain around camera at %i', center => {
    const radius = 420;
    for (const seed of [-420, -123, 0, 321, 420]) {
      const x = wrapNear(seed, center, radius);
      expect(x).toBeGreaterThanOrEqual(center - radius);
      expect(x).toBeLessThan(center + radius);
      expect((x - seed) % (radius * 2)).toBeCloseTo(0);
    }
  });
  it('wraps repeated falls even with a long frame', () => {
    expect(wrapRange(-1110, 100)).toBe(90);
    expect(wrapRange(210, 100)).toBe(10);
  });
});
