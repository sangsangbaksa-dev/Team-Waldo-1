import { describe, expect, it } from 'vitest';
import { renderPixelRatio } from '../../src/shared/render-budget';

describe('render pixel budget', () => {
  it('preserves ordinary DPR when within budget', () => {
    expect(renderPixelRatio(800, 600, 2, 'high')).toBe(2);
    expect(renderPixelRatio(1280, 720, 1, 'standard')).toBe(1);
  });
  it.each(['low', 'standard', 'high'])('bounds 4K rendering for %s', quality => {
    const ratio = renderPixelRatio(3840, 2160, 2, quality);
    const budget = quality === 'high' ? 4_200_000 : quality === 'standard' ? 2_600_000 : 1_500_000;
    expect(ratio).toBeLessThanOrEqual(1);
    expect(3840 * 2160 * ratio * ratio).toBeLessThanOrEqual(Math.max(budget, 3840 * 2160 * 0.25) + 1);
  });
  it('handles invalid DPR and zero viewport', () => {
    expect(renderPixelRatio(0, 0, NaN, 'low')).toBe(1);
  });
});
