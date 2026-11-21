export const SKY_KEY = 'waldo.sky.v1';

export interface SkyRecords { runs: number; bestScore: number; bestWave: number; kills: number; bestCombo: number; longestTime: number }

const empty = (): SkyRecords => ({ runs: 0, bestScore: 0, bestWave: 0, kills: 0, bestCombo: 0, longestTime: 0 });

export function readSkyRecords(): SkyRecords {
  try {
    const r = JSON.parse(localStorage.getItem(SKY_KEY) ?? 'null') as Partial<SkyRecords> | null;
    if (!r || typeof r !== 'object') return empty();
    return {
      runs: Math.max(0, Number(r.runs) || 0), bestScore: Math.max(0, Number(r.bestScore) || 0),
      bestWave: Math.max(0, Number(r.bestWave) || 0), kills: Math.max(0, Number(r.kills) || 0), bestCombo: Math.max(0, Number(r.bestCombo) || 0), longestTime: Math.max(0, Number(r.longestTime) || 0),
    };
  } catch { return empty(); }
}

export function recordSkyRun(score: number, wave: number, kills: number, combo = 0, time = 0): void {
  try {
    const r = readSkyRecords();
    localStorage.setItem(SKY_KEY, JSON.stringify({ runs: r.runs + 1, bestScore: Math.max(r.bestScore, score), bestWave: Math.max(r.bestWave, wave), kills: r.kills + kills, bestCombo: Math.max(r.bestCombo, combo), longestTime: Math.max(r.longestTime, time) }));
  } catch { /* 저장할 수 없으면 건너뜀 */ }
}

export function readSkySummary(): { has: boolean; bestScore: number; bestWave: number } {
  const r = readSkyRecords();
  return { has: r.runs > 0, bestScore: r.bestScore, bestWave: r.bestWave };
}
