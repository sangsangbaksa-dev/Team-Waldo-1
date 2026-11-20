import { describe, expect, it } from 'vitest';
import { minimapTransform } from '../../src/race/minimap';
describe('SPEED RUSH minimap layout', () => {
  it.each([[100, 1000], [1000, 100], [300, 300]])('centers a %i by %i circuit', (w, h) => {
    const t = minimapTransform([50, 50 + w], [-100, -100 + h]);
    expect(t.x + w * t.scale / 2).toBeCloseTo(110);
    expect(t.z + h * t.scale / 2).toBeCloseTo(110);
    expect(t.x).toBeGreaterThanOrEqual(15 - 1e-9);
    expect(t.z).toBeGreaterThanOrEqual(15 - 1e-9);
  });
  it('keeps an empty map finite', () => expect(minimapTransform([], [])).toEqual({minX: 0, minZ: 0, scale: 1, x: 110, z: 110}));
});
