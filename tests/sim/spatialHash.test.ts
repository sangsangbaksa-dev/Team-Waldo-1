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
  it('넓은 탐색(64개 초과 셀)에서도 같은 적을 중복 반환하지 않는다', () => {
    // 용량은 크지만 적은 한 마리: 이전 64칸 방문 기록은 이 검색에서 넘친다.
    const hash = new SpatialHash(32, 300);
    const x = new Float32Array([0]);
    const y = new Float32Array([0]);
    hash.rebuild(x, y, 1);
    const out = new Int32Array(300);

    for (let i = 0; i < 3; i++) {
      const n = hash.query(0, 0, 512, out);
      expect(Array.from(out.subarray(0, n))).toEqual([0]);
    }
  });
});
