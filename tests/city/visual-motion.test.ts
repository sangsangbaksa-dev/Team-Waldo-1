import { describe, expect, it } from 'vitest';
import { cameraBlend, cityCameraShake, ringProgress } from '../../src/city/visual-motion';

describe('city presentation motion', () => {
  it('uses the same settling curve across frame rates', () => {
    const settle = (hz: number) => { let x = 0; for (let i = 0; i < hz; i++) x += (1 - x) * cameraBlend(1 / hz, 6.3); return x; };
    expect(settle(30)).toBeCloseTo(settle(144), 10);
  });
  it('bounds and deterministically samples camera vibration', () => {
    expect(cityCameraShake(1, 100)).toEqual(cityCameraShake(1, 100));
    expect(Math.abs(cityCameraShake(1, 100).x)).toBeLessThanOrEqual(2.8);
    expect(cityCameraShake(1, 0).x).toBe(0);
  });
  it('eases rings without overshooting their radius', () => {
    expect(ringProgress(1, 1)).toBe(0);
    expect(ringProgress(0.5, 1)).toBe(0.75);
    expect(ringProgress(-1, 1)).toBe(1);
  });
});
