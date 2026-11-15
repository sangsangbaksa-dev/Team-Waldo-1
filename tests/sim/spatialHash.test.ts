import { describe, expect, it } from 'vitest';
import { createRng, range } from '../../src/sim/rng';
import { SpatialHash } from '../../src/sim/spatialHash';

describe('SpatialHash', () => {
  it('반경 안의 엔티티를 빠짐없이, 중복 없이 후보로 돌려준다', () => {
    const n = 500;
    const rng = createRng(1);
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = range(rng, -400, 400);
      y[i] = range(rng, -400, 400);
    }
    const hash = new SpatialHash(32, n);
    hash.rebuild(x, y, n);
    const out = new Int32Array(n);

    for (let q = 0; q < 50; q++) {
      const qx = range(rng, -400, 400);
      const qy = range(rng, -400, 400);
      const r = range(rng, 5, 60);
      const got = Array.from(out.subarray(0, hash.query(qx, qy, r, out)));
      expect(new Set(got).size).toBe(got.length);
      for (let i = 0; i < n; i++) {
        if (Math.hypot(x[i] - qx, y[i] - qy) <= r) expect(got).toContain(i);
      }
    }
  });
  it('never repeats entities for large queries spanning more than 64 hash buckets', () => {
    const x = new Float32Array([0, 20, -20, 50]);
    const y = new Float32Array([0, 20, -20, 50]);
    const hash = new SpatialHash(10, 4);
    hash.rebuild(x, y, 4);
    const out = new Int32Array(40);

    // 25 x 25 cells: the previous 64-entry visited list overflowed and emitted duplicates.
    for (let attempt = 0; attempt < 3; attempt++) {
      const count = hash.query(0, 0, 120, out);
      expect(Array.from(out.subarray(0, count)).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    }

    // Rebuilding the index must not reuse an old query's visited state.
    x[0] = 60;
    hash.rebuild(x, y, 4);
    const count = hash.query(0, 0, 120, out);
    expect(Array.from(out.subarray(0, count)).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('rejects invalid dimensions and bounds instead of corrupting the index', () => {
    expect(() => new SpatialHash(0, 4)).toThrow(RangeError);
    expect(() => new SpatialHash(Number.NaN, 4)).toThrow(RangeError);
    expect(() => new SpatialHash(16, -1)).toThrow(RangeError);

    const hash = new SpatialHash(16, 2);
    const x = new Float32Array([0, 2]);
    const y = new Float32Array([0, 2]);
    expect(() => hash.rebuild(x, y, 3)).toThrow(RangeError);
    hash.rebuild(x, y, 2);
    const out = new Int32Array(2);
    expect(hash.query(0, 0, Number.POSITIVE_INFINITY, out)).toBe(0);
    expect(hash.query(Number.NaN, 0, 16, out)).toBe(0);
    expect(hash.query(0, 0, -1, out)).toBe(0);
  });

});
