import { createSkyRecords } from './application/records';
import { browserSkyRecordStore } from './infrastructure/browser-record-store';
import type { SkyRecords } from './domain/records';
export { SKY_KEY } from './infrastructure/browser-record-store';
export type { SkyRecords } from './domain/records';
const service = createSkyRecords(browserSkyRecordStore);
export const readSkyRecords = service.read;
export function recordSkyRun(score: number, wave: number, kills: number, combo = 0, time = 0): void {
  service.record({ score, wave, kills, combo, time });
}
export function readSkySummary(): { has: boolean; bestScore: number; bestWave: number } {
  const r: SkyRecords = service.read();
  return { has: r.runs > 0, bestScore: r.bestScore, bestWave: r.bestWave };
}
