import { describe, expect, it } from 'vitest';
import { blendMotion, impactFrame, IMPACT_LIFETIME } from '../src/infrastructure/visual-motion.js';

describe('field effects', () => {
  it('fades impacts to zero and keeps expansion bounded', () => {
    for (const hit of [false, true]) {
      const start = impactFrame(0, hit, false);
      const mid = impactFrame(IMPACT_LIFETIME / 2, hit, false);
      const end = impactFrame(IMPACT_LIFETIME, hit, false);
      expect(mid.opacity).toBeLessThan(start.opacity);
      expect(end.opacity).toBe(0);
      expect(end.scale).toBeGreaterThan(mid.scale);
      expect(impactFrame(10, hit, false)).toEqual(end);
    }
  });
  it('settles animation at a frame-rate independent speed', () => {
    const settle = (hz: number) => { let x = 0; for (let i = 0; i < hz; i++) x += (1 - x) * blendMotion(1 / hz, 12); return x; };
    expect(settle(30)).toBeCloseTo(settle(144), 10);
  });
});
