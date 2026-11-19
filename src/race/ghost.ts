// SPEED RUSH — 타임어택 고스트: 내 최고 기록 주행을 0.1초마다 기록해 두었다가 반투명 차로 다시 달리게 합니다. 화면과 무관한 순수 로직입니다.
import type { CarState } from './physics';

/** 기록 간격(초) */
export const GHOST_DT = 0.1;
const STRIDE = 4; // x, z, 방향, 누적 진행(샘플 단위)
export interface Ghost { time: number; laps: number; data: number[] }
export interface GhostPose { x: number; z: number; h: number; total: number }

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** 달리는 동안 표본을 쌓습니다. */
export class GhostRecorder {
  data: number[] = []; private next = 0;
  tick(clock: number, c: Pick<CarState, 'x' | 'z' | 'h' | 'total'>): void {
    if (clock < this.next) return;
    this.next = (Math.floor(clock / GHOST_DT) + 1) * GHOST_DT;
    this.data.push(r2(c.x), r2(c.z), r2(c.h), r2(c.total));
  }
  finish(time: number, laps: number): Ghost { return { time, laps, data: this.data.slice() }; }
}

const count = (g: Ghost): number => Math.floor(g.data.length / STRIDE);
const angleLerp = (a: number, b: number, k: number): number => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

/** 출발 후 clock 초 시점의 고스트 위치. 기록이 끝나면 null(결승선을 지난 뒤). */
export function ghostAt(g: Ghost, clock: number): GhostPose | null {
  const n = count(g); if (n < 2 || clock < 0) return n ? pose(g, 0) : null;
  const f = clock / GHOST_DT, i = Math.floor(f); if (i >= n - 1) return null;
  const a = pose(g, i), b = pose(g, i + 1), k = f - i;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h: angleLerp(a.h, b.h, k), total: a.total + (b.total - a.total) * k };
}
function pose(g: Ghost, i: number): GhostPose { const o = i * STRIDE; return { x: g.data[o], z: g.data[o + 1], h: g.data[o + 2], total: g.data[o + 3] }; }

/** 고스트가 누적 진행 total 에 도달한 시각(초). 아직 기록에 없으면 null. */
export function ghostTimeAt(g: Ghost, total: number): number | null {
  const n = count(g); if (n < 2) return null;
  if (total <= g.data[3]) return 0;
  let lo = 0, hi = n - 1; if (g.data[hi * STRIDE + 3] < total) return null;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (g.data[mid * STRIDE + 3] < total) lo = mid; else hi = mid; }
  const a = g.data[lo * STRIDE + 3], b = g.data[hi * STRIDE + 3], k = b > a ? (total - a) / (b - a) : 0;
  return (lo + k) * GHOST_DT;
}
/** 내 현재 시각과 고스트의 차이(초). 음수면 내가 앞섭니다. */
export const ghostDelta = (g: Ghost, total: number, clock: number): number | null => { const t = ghostTimeAt(g, total); return t === null ? null : clock - t; };

export const ghostKey = (map: string, laps: number, car: string): string => `waldo.race.ghost.v1:${map}:${laps}:${car}`;
/** 저장된 값이 깨져 있으면 null. */
export function sanitizeGhost(raw: unknown): Ghost | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.time !== 'number' || !Number.isFinite(r.time) || r.time <= 0 || typeof r.laps !== 'number' || !Array.isArray(r.data)) return null;
  if (r.data.length < STRIDE * 2 || r.data.length % STRIDE !== 0 || r.data.length > 200_000 || !r.data.every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  return { time: r.time, laps: r.laps, data: r.data as number[] };
}
export function readGhost(map: string, laps: number, car: string): Ghost | null {
  try { return sanitizeGhost(JSON.parse(localStorage.getItem(ghostKey(map, laps, car)) ?? 'null')); } catch { return null; }
}
export function writeGhost(map: string, laps: number, car: string, g: Ghost): void {
  try { localStorage.setItem(ghostKey(map, laps, car), JSON.stringify(g)); } catch { /* 저장 불가 환경 */ }
}
