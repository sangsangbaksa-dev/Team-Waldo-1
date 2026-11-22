import { describe, expect, it } from 'vitest';
import { skyColors } from '../../src/outlaw/textures';

describe('OUTLAW reusable sky palette', () => {
  it('returns the same sky buffers for repeated render frames', () => {
    const out = skyColors(8), vectors = [out.sunDir, out.moonDir],
      colors = [out.top, out.horizon, out.fog, out.sun, out.hemiSky, out.hemiGround];
    const previous = out.top.clone();
    for (const hour of [9, 12, 16, 19, 23, 3]) {
      expect(skyColors(hour, out)).toBe(out);
      expect([out.sunDir, out.moonDir]).toEqual(vectors);
      expect([out.top, out.horizon, out.fog, out.sun, out.hemiSky, out.hemiGround]).toEqual(colors);
      expect(out.sunDir.length()).toBeCloseTo(1);
      expect(out.sunDir.dot(out.moonDir)).toBeCloseTo(-1);
      expect([out.night, out.stars, out.sunIntensity, out.hemiIntensity].every(Number.isFinite)).toBe(true);
    }
    expect(out.top.equals(previous)).toBe(false);
  });
  it('keeps independent palettes when no output buffer is supplied', () => {
    const noon = skyColors(12), dusk = skyColors(19);
    const original = noon.top.clone();
    skyColors(1, dusk);
    expect(noon.top.equals(original)).toBe(true);
    expect(noon).not.toBe(dusk);
    expect(noon.night).toBeLessThan(0.01);
  });
});
