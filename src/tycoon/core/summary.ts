// Small hub-only save preview. Do not import the HUSTLE world/model from the home page.
import { STAGES, STAGE_NAMES } from './stages';
import type { Stage } from './types';

export { STAGE_NAMES };
export const TYCOON_SAVE_KEY = 'waldo.tycoon.v1';

export interface TycoonSummary { has: boolean; cash: number; stage: Stage; day: number; won: boolean }
const empty = (): TycoonSummary => ({ has: false, cash: 0, stage: 'broke', day: 1, won: false });

/** Reads only the public summary of a versioned save; never loads the simulation. */
export function readTycoonSummary(storage?: Storage): TycoonSummary {
  try {
    const raw = JSON.parse((storage ?? globalThis.localStorage).getItem(TYCOON_SAVE_KEY) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty();
    const r = raw as Record<string, unknown>;
    if (r.v !== 1) return empty();
    const stage: Stage = typeof r.stage === 'string' && STAGES.includes(r.stage as Stage) ? r.stage as Stage : 'broke';
    const cash = typeof r.cash === 'number' && Number.isFinite(r.cash) ? r.cash : 0;
    const day = typeof r.day === 'number' && Number.isFinite(r.day) ? Math.max(1, Math.round(r.day)) : 1;
    return { has: true, cash, stage, day, won: typeof r.won === 'boolean' ? r.won : false };
  } catch { return empty(); }
}
