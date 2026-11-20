import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/race/maps';
import { buildMapTrack } from '../src/race/track';
import { maxLookCurvature, TrackClearanceIndex } from '../src/race/track-queries';

function referenceCurve(k: Float32Array, start: number, look: number): number {
  let max = 0;
  for (let o = 0; o <= look; o += 2) max = Math.max(max, Math.abs(k[(start + o) % k.length]));
  return max;
}

describe('SPEED RUSH indexed lookups', () => {
  it('matches the AI look-ahead loop at every sample of every circuit', () => {
    for (const map of MAPS) {
      const t = buildMapTrack(map);
      for (let i = 0; i < t.n; i++) {
        for (const look of [0, 1, 12, 13, 16, 31, 42, 63]) {
          expect(maxLookCurvature(t.k, i, look)).toBe(referenceCurve(t.k, i, look));
        }
      }
    }
  });

  it('preserves parity and wraparound on even and odd sample counts', () => {
    for (const values of [[1, -5, 2, 4, 3], [1, 20, 2, 40, 3, 60], [2]]) {
      const k = new Float32Array(values);
      for (let i = 0; i < k.length; i++) for (const look of [0, 2, 3, 10, 29, 100]) {
        expect(maxLookCurvature(k, i, look)).toBe(referenceCurve(k, i, look));
      }
    }
  });

  it('matches road collision clearance in all circuits, for both slope and flat modes', () => {
    for (const map of MAPS) {
      const t = buildMapTrack(map);
      for (const [stride, slope] of [[1, true], [2, false]] as const) {
        const index = new TrackClearanceIndex(t, stride, slope);
        for (let i = 0; i < t.n; i += Math.max(1, Math.floor(t.n / 40))) {
          for (const offset of [-200, -55, -10, 0, 10, 55, 200]) {
            const x = t.x[i] - t.tz[i] * offset, z = t.z[i] + t.tx[i] * offset;
            for (const need of [-1, 0, 10, 40, 200, 5000]) {
              let expected = false;
              for (let j = 0; j < t.n; j += stride) {
                if (Math.hypot(t.x[j] - x, t.z[j] - z) < need + (slope ? Math.max(0, t.y[j] * 2.4 - 2) : 0)) {
                  expected = true; break;
                }
              }
              expect(index.overlaps(x, z, need)).toBe(expected);
            }
          }
        }
      }
    }
  });

  it('retains strict radius boundaries and negative grid coordinates', () => {
    const road = { x: new Float32Array([-64, 64]), y: new Float32Array([0, 10]), z: new Float32Array([0, 0]) };
    const flat = new TrackClearanceIndex(road, 1, false), sloped = new TrackClearanceIndex(road);
    expect(flat.overlaps(-74, 0, 10)).toBe(false);
    expect(flat.overlaps(-73.99, 0, 10)).toBe(true);
    expect(sloped.overlaps(96, 0, 10)).toBe(false);
    expect(sloped.overlaps(95.99, 0, 10)).toBe(true);
  });
});
