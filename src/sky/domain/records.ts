export interface SkyRecords { runs: number; bestScore: number; bestWave: number; kills: number; bestCombo: number; longestTime: number }
export interface SkyRun { score: number; wave: number; kills: number; combo: number; time: number }
export const emptyRecords = (): SkyRecords => ({ runs: 0, bestScore: 0, bestWave: 0, kills: 0, bestCombo: 0, longestTime: 0 });
const nonnegative = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, n) : 0; };
export function normalizeRecords(value: unknown): SkyRecords {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyRecords();
  const r = value as Partial<SkyRecords>;
  return { runs: nonnegative(r.runs), bestScore: nonnegative(r.bestScore), bestWave: nonnegative(r.bestWave), kills: nonnegative(r.kills), bestCombo: nonnegative(r.bestCombo), longestTime: nonnegative(r.longestTime) };
}
export function addRun(r: SkyRecords, run: SkyRun): SkyRecords {
  return { runs: r.runs + 1, bestScore: Math.max(r.bestScore, nonnegative(run.score)), bestWave: Math.max(r.bestWave, nonnegative(run.wave)), kills: r.kills + nonnegative(run.kills), bestCombo: Math.max(r.bestCombo, nonnegative(run.combo)), longestTime: Math.max(r.longestTime, nonnegative(run.time)) };
}
