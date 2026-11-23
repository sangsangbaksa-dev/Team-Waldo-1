export const SKY_KEY = 'waldo.sky.v1';

export interface SkyRecords { runs: number; bestScore: number; bestWave: number; kills: number; bestCombo: number; longestTime: number }

const empty = (): SkyRecords => ({ runs: 0, bestScore: 0, bestWave: 0, kills: 0, bestCombo: 0, longestTime: 0 });

/** 손상되었거나 구형 클라이언트가 기록한 저장값을 안전한 유한 숫자로 정규화합니다. */
const safe = (value: unknown, integer = false): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const bounded = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, n));
  return integer ? Math.floor(bounded) : bounded;
};

export function readSkyRecords(): SkyRecords {
  try {
    const r = JSON.parse(localStorage.getItem(SKY_KEY) ?? 'null') as Partial<SkyRecords> | null;
    if (!r || typeof r !== 'object') return empty();
    return {
      runs: safe(r.runs, true),
      bestScore: safe(r.bestScore, true),
      bestWave: safe(r.bestWave, true),
      kills: safe(r.kills, true),
      bestCombo: safe(r.bestCombo, true),
      longestTime: safe(r.longestTime),
    };
  } catch { return empty(); }
}

export function recordSkyRun(score: number, wave: number, kills: number, combo = 0, time = 0): void {
  try {
    const r = readSkyRecords();
    localStorage.setItem(SKY_KEY, JSON.stringify({
      runs: safe(r.runs + 1, true),
      bestScore: Math.max(r.bestScore, safe(score, true)),
      bestWave: Math.max(r.bestWave, safe(wave, true)),
      kills: safe(r.kills + safe(kills, true), true),
      bestCombo: Math.max(r.bestCombo, safe(combo, true)),
      longestTime: Math.max(r.longestTime, safe(time)),
    }));
  } catch { /* 저장할 수 없으면 건너뜀 */ }
}

export function readSkySummary(): { has: boolean; bestScore: number; bestWave: number } {
  const r = readSkyRecords();
  return { has: r.runs > 0, bestScore: r.bestScore, bestWave: r.bestWave };
}
