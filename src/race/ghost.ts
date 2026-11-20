// SPEED RUSH — 타임어택 고스트: 내 최고 기록 주행을 0.1초마다 기록해 두었다가 반투명 차로 다시 달리게 합니다. 화면과 무관한 순수 로직입니다.

/** 기록 간격(초) */
export const GHOST_DT = 0.1;
const STRIDE = 4; // x, z, 방향, 누적 진행(샘플 단위)
export interface Ghost { time: number; laps: number; data: number[]; finalSample?: true }
export interface GhostPose { x: number; z: number; h: number; total: number }

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** 달리는 동안 표본을 쌓습니다. */
export class GhostRecorder {
  data: number[] = [];

  tick(clock: number, c: GhostPose): void {
    if (!Number.isFinite(clock) || clock < count(this) * GHOST_DT || ![c.x, c.z, c.h, c.total].every(Number.isFinite)) return;
    this.data.push(r2(c.x), r2(c.z), r2(c.h), r2(c.total));
  }

  finish(time: number, laps: number, c?: GhostPose): Ghost {
    const data = this.data.slice();
    if (!c) return { time, laps, data };
    const sample = [r2(c.x), r2(c.z), r2(c.h), r2(c.total)];
    if (time === (count(this) - 1) * GHOST_DT) data.splice(-STRIDE, STRIDE, ...sample);
    else data.push(...sample);
    return { time, laps, data, finalSample: true };
  }
}

const count = (g: Pick<Ghost, 'data'>): number => Math.floor(g.data.length / STRIDE);
const sampleTime = (g: Ghost, i: number): number => g.finalSample && i === count(g) - 1 ? g.time : i * GHOST_DT;
const angleLerp = (a: number, b: number, k: number): number => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

/** 출발 후 clock 초 시점의 고스트 위치. 기록이 끝나면 null(결승선을 지난 뒤). */
export function ghostAt(g: Ghost, clock: number): GhostPose | null {
  const n = count(g);
  if (n === 0 || !Number.isFinite(clock) || clock > g.time) return null;
  if (clock <= 0) return pose(g, 0);
  if (clock >= sampleTime(g, n - 1)) return pose(g, n - 1);
  const i = Math.min(n - 2, Math.floor(clock / GHOST_DT));
  const a = pose(g, i), b = pose(g, i + 1);
  const start = sampleTime(g, i), k = (clock - start) / (sampleTime(g, i + 1) - start);
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h: angleLerp(a.h, b.h, k), total: a.total + (b.total - a.total) * k };
}
function pose(g: Ghost, i: number): GhostPose { const o = i * STRIDE; return { x: g.data[o], z: g.data[o + 1], h: g.data[o + 2], total: g.data[o + 3] }; }

// 역주행했던 구간에서도 진행 지점에 처음 도착한 표본을 찾습니다.
const progressCache = new WeakMap<Ghost, number[]>();
function furthestProgress(g: Ghost): number[] {
  const cached = progressCache.get(g);
  if (cached) return cached;
  const progress: number[] = [];
  let furthest = -Infinity;
  for (let i = 3; i < g.data.length; i += STRIDE) {
    furthest = Math.max(furthest, g.data[i]);
    progress.push(furthest);
  }
  progressCache.set(g, progress);
  return progress;
}

/** 고스트가 누적 진행 total 에 도달한 시각(초). 아직 기록에 없으면 null. */
export function ghostTimeAt(g: Ghost, total: number): number | null {
  const n = count(g); if (n < 2 || !Number.isFinite(total)) return null;
  if (total <= g.data[3]) return 0;
  const progress = furthestProgress(g);
  let lo = 0, hi = n - 1; if (progress[hi] < total) return null;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (progress[mid] < total) lo = mid; else hi = mid; }
  const a = g.data[lo * STRIDE + 3], b = g.data[hi * STRIDE + 3], k = b > a ? (total - a) / (b - a) : 0;
  const start = sampleTime(g, lo);
  return start + (sampleTime(g, hi) - start) * k;
}
/** 내 현재 시각과 고스트의 차이(초). 음수면 내가 앞섭니다. */
export const ghostDelta = (g: Ghost, total: number, clock: number): number | null => { const t = ghostTimeAt(g, total); return t === null || !Number.isFinite(clock) ? null : clock - t; };

export const ghostKey = (map: string, laps: number, car: string): string => `waldo.race.ghost.v1:${map}:${laps}:${car}`;
/** 저장된 값이 깨져 있으면 null. */
export function sanitizeGhost(raw: unknown): Ghost | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.time !== 'number' || !Number.isFinite(r.time) || r.time <= 0 || typeof r.laps !== 'number' || !Array.isArray(r.data)) return null;
  if (r.data.length < STRIDE * 2 || r.data.length % STRIDE !== 0 || r.data.length > 200_000 || !r.data.every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  if (!Number.isInteger(r.laps) || r.laps <= 0) return null;
  const result: Ghost = { time: r.time, laps: r.laps, data: r.data as number[] };
  if (r.finalSample === true) {
    const samples = count(result);
    if (r.time <= (samples - 2) * GHOST_DT || r.time > (samples - 1) * GHOST_DT) return null;
    result.finalSample = true;
  }
  return result;
}
export function readGhost(map: string, laps: number, car: string): Ghost | null {
  try {
    const ghost = sanitizeGhost(JSON.parse(localStorage.getItem(ghostKey(map, laps, car)) ?? 'null'));
    return ghost?.laps === laps ? ghost : null;
  } catch { return null; }
}
export function writeGhost(map: string, laps: number, car: string, g: Ghost): void {
  try { localStorage.setItem(ghostKey(map, laps, car), JSON.stringify(g)); } catch { /* 저장 불가 환경 */ }
}
