import { describe, expect, it } from 'vitest';
import { wrapNear, wrapRange, visibleRainStreaks, rainParticleBudget } from '../../src/city/render-math';

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

describe('LAST CITY quality-adaptive rain rendering', () => {
  it('does not allocate or animate rain on a clear sky or reduced motion', () => {
    expect(visibleRainStreaks(1600, 0)).toBe(0);
    expect(visibleRainStreaks(1600, 0.05)).toBe(0);
    expect(visibleRainStreaks(1600, 1, true)).toBe(0);
  });
  it('updates only the particles that can actually be drawn', () => {
    expect(visibleRainStreaks(1600, 0.25)).toBe(400);
    expect(visibleRainStreaks(1600, 0.75)).toBe(1200);
    expect(visibleRainStreaks(1600, 1)).toBe(1600);
    expect(visibleRainStreaks(1600, 3)).toBe(1600);
    expect(visibleRainStreaks(1600, NaN)).toBe(0);
  });
  it('allocates fewer rain lines on low- and standard-quality GPUs', () => {
    expect(rainParticleBudget('low')).toBeLessThan(rainParticleBudget('standard'));
    expect(rainParticleBudget('standard')).toBeLessThan(rainParticleBudget('high'));
  });
});
