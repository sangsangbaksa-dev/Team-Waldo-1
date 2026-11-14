// SPEED RUSH — 서킷 계산. 닫힌 Catmull-Rom 스플라인을 일정 간격으로 샘플링하고, 충돌·AI·진행도 계산을 돕습니다. (THREE 의존 없음)
import { MAPS, type MapDef } from './maps';

/** 중심선 제어점: x, z 는 수평 위치(m), y 는 고도(m). */
export type ControlPoint = readonly [number, number, number];

export const SAMPLE_SPACING = 4;

export interface Track {
  n: number; ds: number; length: number; halfWidth: number;
  x: Float32Array; y: Float32Array; z: Float32Array;
  /** 진행 방향 단위벡터(수평) */
  tx: Float32Array; tz: Float32Array;
  /** 부호 있는 곡률(1/m). 양수는 오른쪽 커브. */
  k: Float32Array;
  /** 경사각(rad, 오르막이 양수) */
  pitch: Float32Array;
  /** 부스트 패드가 놓인 샘플 인덱스 */
  pads: number[];
}

type V3 = [number, number, number];
function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t, t3 = t2 * t, out: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[i] = 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  return out;
}

export function buildTrack(points: ReadonlyArray<ControlPoint> = MAPS[0].points, halfWidth = MAPS[0].halfWidth, spacing = SAMPLE_SPACING, padFractions: readonly number[] = MAPS[0].pads): Track {
  const m = points.length, dense: V3[] = [], per = 48;
  for (let i = 0; i < m; i++) {
    const a = points[(i + m - 1) % m], b = points[i], c = points[(i + 1) % m], d = points[(i + 2) % m];
    for (let s = 0; s < per; s++) dense.push(catmull([...a], [...b], [...c], [...d], s / per));
  }
  const cum: number[] = [0];
  for (let i = 1; i <= dense.length; i++) { const p = dense[i - 1], q = dense[i % dense.length]; cum.push(cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const total = cum[dense.length], n = Math.round(total / spacing), ds = total / n;
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds; while (j < dense.length - 1 && cum[j + 1] < s) j++;
    const p = dense[j], q = dense[(j + 1) % dense.length], seg = cum[j + 1] - cum[j], f = seg > 0 ? (s - cum[j]) / seg : 0;
    x[i] = p[0] + (q[0] - p[0]) * f; z[i] = p[1] + (q[1] - p[1]) * f; y[i] = p[2] + (q[2] - p[2]) * f;
  }
  const tx = new Float32Array(n), tz = new Float32Array(n), k = new Float32Array(n), pitch = new Float32Array(n), raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, b = (i + 1) % n, dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz);
    tx[i] = dx / l; tz[i] = dz / l; pitch[i] = Math.atan2(y[b] - y[a], l);
  }
  for (let i = 0; i < n; i++) {
    const b = (i + 1) % n, cross = tx[i] * tz[b] - tz[i] * tx[b], dot = tx[i] * tx[b] + tz[i] * tz[b];
    raw[i] = Math.atan2(cross, dot) / ds;
  }
  for (let i = 0; i < n; i++) { let s = 0; for (let o = -3; o <= 3; o++) s += raw[(i + o + n) % n]; k[i] = s / 7; }
  const pads: number[] = []; for (const f of padFractions) pads.push(Math.round(f * n) % n);
  return { n, ds, length: total, halfWidth, x, y, z, tx, tz, k, pitch, pads };
}

export interface Nearest { i: number; lat: number; dist: number }
/** hint 주변(±win)에서 가장 가까운 샘플과 중심선 기준 좌우 오프셋(오른쪽이 +)을 찾습니다. win<0 이면 전체 탐색. */
export function nearest(t: Track, px: number, pz: number, hint: number, win = 40): Nearest {
  const n = t.n, full = win < 0 || win * 2 + 1 >= n; let best = 0, bd = Infinity;
  const lo = full ? 0 : -win, hi = full ? n - 1 : win;
  for (let o = lo; o <= hi; o++) {
    const i = full ? o : (hint + o + n * 4) % n, dx = px - t.x[i], dz = pz - t.z[i], d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  const dx = px - t.x[best], dz = pz - t.z[best];
  return { i: best, lat: dx * -t.tz[best] + dz * t.tx[best], dist: Math.sqrt(bd) };
}

export const wrapIdx = (t: Track, i: number): number => ((i % t.n) + t.n) % t.n;
/** 진행 방향 기준 샘플 인덱스 차이(−n/2..n/2). */
export function idxDelta(t: Track, from: number, to: number): number {
  let d = to - from; if (d < -t.n / 2) d += t.n; else if (d > t.n / 2) d -= t.n; return d;
}

/** 코스 정의로 서킷을 만듭니다. */
export const buildMapTrack = (m: MapDef): Track => buildTrack(m.points, m.halfWidth, SAMPLE_SPACING, m.pads);
