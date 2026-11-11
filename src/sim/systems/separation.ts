import type { World } from '../types';

const candidates = new Int32Array(64);
const STRENGTH = 0.5;

/**
 * 겹친 적끼리 살짝 밀어내서 한 점에 뭉치지 않게 한다. collision이 만든 해시를 그대로 쓰고,
 * 비용을 줄이려고 틱마다 절반의 적만 처리한다. 밀리지 않는 적(knockbackResist 1)은 움직이지 않는다.
 */
export function separation(world: World): void {
  const { enemies: e, hash, data } = world;
  for (let i = world.tick & 1; i < e.count; i += 2) {
    if (e.hp[i] <= 0) continue;
    const n = hash.query(e.x[i], e.y[i], e.r[i], candidates);
    for (let k = 0; k < n; k++) {
      const j = candidates[k];
      if (j === i || e.hp[j] <= 0) continue;
      const dx = e.x[i] - e.x[j];
      const dy = e.y[i] - e.y[j];
      const rr = e.r[i] + e.r[j];
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = ((rr - d) / d) * STRENGTH * 0.5;
      const wi = 1 - data.enemies[e.kind[i]].knockbackResist;
      const wj = 1 - data.enemies[e.kind[j]].knockbackResist;
      e.x[i] += dx * push * wi;
      e.y[i] += dy * push * wi;
      e.x[j] -= dx * push * wj;
      e.y[j] -= dy * push * wj;
    }
  }
}
