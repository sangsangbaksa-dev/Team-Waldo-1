// SPEED RUSH — 사막 하이웨이 길가 군사 초소. FRONTLINE 사막 기지에서 옮겨 온 공용 소품(src/shared/desertprops.ts)으로
// 곧고 평평한 구간 옆에 감시탑·콘크리트 벽·천막·차량·레이더를 세웁니다. 화면 장식일 뿐 도로·충돌·AI 에는 영향이 없습니다.
import * as THREE from 'three';
import { bakeStatic, DesertKit, seeded } from '../shared/desertprops';
import { type Track } from './track';

export interface OutpostSpot { i: number; side: 1 | -1; /** 도로 중심선에서 초소 중심까지의 거리(m) */ off: number }

const GROUND = -0.4, HALF_U = 16, HALF_V = 12;
/** 시속 200km 로 지나가도 눈에 띄도록 소품 묶음을 키웁니다(탑이 약 10m). */
const SCALE = 2;
/** 도로 비탈이 끝나는 곳에서 초소 중심까지 띄우는 거리(길 쪽 벽까지 여유 포함) */
const GAP = HALF_V * SCALE + 2;
const slopeWidth = (t: Track, i: number): number => Math.max(6, t.y[i] * 2.4 + 4);

/** 곧고(완만한 커브) 낮은 구간의 도로 옆에서, 다른 도로 구간과 겹치지 않고 서로 떨어진 초소 자리를 찾습니다. 같은 코스에서는 늘 같은 자리가 나옵니다. */
export function findOutpostSpots(t: Track, count: number): OutpostSpot[] {
  const out: OutpostSpot[] = [], hw = t.halfWidth, n = t.n, span = Math.round(40 / t.ds), reach = Math.round(n * 0.07);
  const flat = (i: number): boolean => {
    if (t.y[i] > 5) return false; // 높이 올라간 도로는 가드월에 가려 초소가 보이지 않습니다
    for (let o = -span; o <= span; o++) { const j = (i + o + n) % n; if (Math.abs(t.k[j]) > 0.006 || Math.abs(t.y[j] - t.y[i]) > 3) return false; }
    return true;
  };
  const clear = (x: number, z: number, off: number): boolean => {
    for (let j = 0; j < n; j++) if (Math.hypot(t.x[j] - x, t.z[j] - z) < Math.min(off - 3, hw + HALF_U * SCALE + Math.max(0, t.y[j] * 2.4 - 2))) return false;
    return true;
  };
  for (const f of [0.46, 0.81, 0.93, 0.15]) {
    if (out.length >= count) break;
    const base = Math.round(f * n);
    search: for (let d = 0; d <= reach; d++) for (const o of d ? [d, -d] : [0]) {
      const i = (base + o + n) % n;
      if (Math.min(i, n - i) < Math.round(120 / t.ds) || !flat(i)) continue; // 출발선 가까이는 비웁니다
      if (out.some(s => Math.min(Math.abs(s.i - i), n - Math.abs(s.i - i)) < n * 0.2)) continue;
      const off = hw + 1.5 + slopeWidth(t, i) + GAP;
      for (const side of [1, -1] as const) {
        const x = t.x[i] - t.tz[i] * off * side, z = t.z[i] + t.tx[i] * off * side;
        if (clear(x, z, off)) { out.push({ i, side, off }); break search; }
      }
    }
  }
  return out;
}

export interface Outpost { group: THREE.Group; update(t: number): void; dispose(): void }

/**
 * 초소 하나: 길 쪽 벽과 문, 양쪽 감시탑, 안쪽 천막·레이더·발전기·차량.
 * 자리마다 앞뒤(u)는 도로 방향(바깥쪽이 왼쪽이 되도록 필요하면 뒤집음), 옆(v)은 도로에서 바깥쪽입니다.
 */
export function buildOutposts(scene: THREE.Scene, t: Track, low: boolean): Outpost {
  const kit = new DesertKit([0xf2c230, 0xd8402a], false), root = new THREE.Group();
  const spots = findOutpostSpots(t, low ? 1 : 2);
  spots.forEach((s, k) => {
    const rnd = seeded(31 + k * 7), nx = -t.tz[s.i] * s.side, nz = t.tx[s.i] * s.side, ux = t.tx[s.i] * s.side, uz = t.tz[s.i] * s.side, b = Math.atan2(uz, ux), c = new THREE.Group();
    // (u, v) 는 초소 안쪽 좌표, psi 는 물체의 앞(+x)을 u 축에서 돌린 각(라디안). 소품마다 +z 쪽이 psi+90도 방향입니다.
    const put = (g: THREE.Group, u: number, v: number, psi: number): void => { g.position.set(ux * u + nx * v, GROUND, uz * u + nz * v); g.rotation.y = -(b + psi); c.add(g); };
    const front = -HALF_V + 2; // 길 쪽 벽의 v
    for (const u of [-8.2, 8.2]) put(kit.twall(), u, front, 0);
    for (const u of [-12.4, 12.4]) put(kit.tower(k % 2), u, front - 0.6, rnd() * 6);
    put(kit.flag(0), -3.4, front - 0.4, 0); put(kit.flag(1), 3.4, front - 0.4, 0);
    for (const u of [-5.6, 5.6]) put(kit.sandbags(), u, front + 2.2, 0); // 오목한 쪽(+z)이 안쪽
    for (const u of [-5, 4.5]) put(kit.tent(), u, 3.6 + rnd(), Math.PI + (rnd() - 0.5) * 0.3); // 천막 문(+z)이 길을 향함
    put(kit.generator(), -1, 4, rnd() * 6); put(kit.radar(k % 2), -10.5, 6.5, rnd() * 6); put(kit.windsock(), 12, 5, 0.6);
    put(kit.vehicle('humvee', 0), 7, 1.4, 0.05); put(kit.vehicle('truck', 1), 12.5, 1.2, -0.04); if (!low) put(kit.vehicle('tanker', 0), -13.5, 2.6, 0.08);
    for (let i = 0; i < (low ? 2 : 4); i++) put(kit.crates(i + k * 4), -12 + i * 5.5 + rnd() * 2, 8 + rnd() * 2, rnd() * 6);
    for (const u of [-14.5, 14.5]) put(kit.hesco(), u, front + 4, 0);
    if (!low) put(kit.wreck(k * 2), (k % 2 ? -1 : 1) * (HALF_U + 4), 3, rnd() * 6); // 초소 옆에 버려진 전차
    bakeStatic(c); c.scale.setScalar(SCALE); c.position.set(t.x[s.i] + nx * s.off, 0, t.z[s.i] + nz * s.off); root.add(c);
  });
  scene.add(root);
  return {
    group: root, update: tm => kit.update(tm),
    dispose: () => {
      scene.remove(root); kit.dispose();
      root.traverse(o => { const m = o as THREE.Mesh; if (!m.geometry) return; m.geometry.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose(); });
    },
  };
}
