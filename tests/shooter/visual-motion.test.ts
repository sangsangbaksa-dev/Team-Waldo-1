import { describe, expect, it } from 'vitest';
import { cameraVibration, motionBlend, proxyVisible, wrappedOffset } from '../../src/shooter/visual-motion';

describe('shooter presentation motion', () => {
  it('retains the current LOD within the transition band', () => {
    expect(proxyVisible(false, 78, true)).toBe(false);
    expect(proxyVisible(true, 78, true)).toBe(true);
    expect(proxyVisible(false, 83, true)).toBe(true);
    expect(proxyVisible(true, 67, true)).toBe(false);
    expect(proxyVisible(true, 120, false)).toBe(false);
  });
  it('wraps rain around either side of large world coordinates', () => {
    for (const x of [-1500, -460, -46, 0, 46, 460, 1500]) {
      const offset = wrappedOffset(x, 46);
      expect(offset).toBeGreaterThanOrEqual(-46);
      expect(offset).toBeLessThan(46);
      expect(wrappedOffset(x + 92, 46)).toBe(offset);
    }
  });
  it('keeps camera noise continuous and suppresses it in reduced motion', () => {
    const a = cameraVibration(1, 1, false), b = cameraVibration(1.001, 1, false);
    expect(Math.abs(a.pitch - b.pitch)).toBeLessThan(0.0002);
    expect(Math.abs(cameraVibration(1, 1, true).pitch)).toBe(0);
    expect(motionBlend(0, 12)).toBe(0);
  });
});
