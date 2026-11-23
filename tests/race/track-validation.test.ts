import { describe, expect, it } from 'vitest';
import { MAPS } from '../../src/race/maps';
import { buildMapTrack, buildTrack, nearest } from '../../src/race/track';

const points = MAPS[0].points;

describe('SPEED RUSH authored track validation', () => {
  it('rejects malformed and degenerate circuits instead of allocating invalid buffers', () => {
    expect(() => buildTrack([])).toThrow(RangeError);
    expect(() => buildTrack([[0, 0, 0], [1, 0, 0], [2, 0, 0]])).toThrow(RangeError);
    expect(() => buildTrack([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])).toThrow(RangeError);
    expect(() => buildTrack([[0, 0, 0], [100, 0, 0], [100, 100, NaN], [0, 100, 0]])).toThrow(RangeError);
    expect(() => buildTrack(points, 0)).toThrow(RangeError);
    expect(() => buildTrack(points, Infinity)).toThrow(RangeError);
    expect(() => buildTrack(points, 12, 0)).toThrow(RangeError);
    expect(() => buildTrack(points, 12, 1e-8)).toThrow(RangeError);
    expect(() => buildTrack(points, 12, 4, [0.2, NaN])).toThrow(RangeError);
    expect(() => buildTrack(points, 12, 4, [-0.5])).toThrow(RangeError);
  });

  it('still constructs every shipped track with finite coordinates and directions', () => {
    for (const map of MAPS) {
      const t = buildMapTrack(map);
      expect(t.n).toBeGreaterThan(100);
      expect(t.n).toBeLessThan(200_000);
      for (let i = 0; i < t.n; i++) {
        expect(Number.isFinite(t.tx[i])).toBe(true);
        expect(Number.isFinite(t.tz[i])).toBe(true);
        expect(Number.isFinite(t.pitch[i])).toBe(true);
      }
    }
  });

  it('tolerates an invalid locality hint without reading typed arrays at NaN indices', () => {
    const t = buildMapTrack(MAPS[0]);
    const x = t.x[42], z = t.z[42];
    const all = nearest(t, x, z, 0, -1);
    expect(nearest(t, x, z, Infinity, NaN)).toEqual(all);
    const first = nearest(t, x, z, NaN, 40);
    expect(Number.isFinite(first.lat)).toBe(true);
    expect(first.i).toBeGreaterThanOrEqual(0);
    expect(first.i).toBeLessThan(t.n);
    expect(nearest(t, NaN, z, 20).dist).toBe(Infinity);
  });
});
