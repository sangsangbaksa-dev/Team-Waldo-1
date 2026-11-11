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
});
