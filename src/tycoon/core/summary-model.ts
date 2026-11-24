// Pure, lightweight save preview; does not import the simulation.
import { STAGES, STAGE_NAMES } from './stages';
import type { Stage } from './types';

export { STAGE_NAMES };

export interface TycoonSummary { has: boolean; cash: number; stage: Stage; day: number; won: boolean }
const empty = (): TycoonSummary => ({ has: false, cash: 0, stage: 'broke', day: 1, won: false });


export function summarizeSave(raw: unknown): TycoonSummary {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty();
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return empty();
  const stage: Stage = typeof r.stage === 'string' && STAGES.includes(r.stage as Stage) ? r.stage as Stage : 'broke';
  const cash = typeof r.cash === 'number' && Number.isFinite(r.cash) ? r.cash : 0;
  const day = typeof r.day === 'number' && Number.isFinite(r.day) ? Math.max(1, Math.round(r.day)) : 1;
  return { has: true, cash, stage, day, won: typeof r.won === 'boolean' ? r.won : false };
}
