import { summarizeSave, type TycoonSummary } from '../core/summary-model';

export const TYCOON_SAVE_KEY = 'waldo.tycoon.v1';

export function readTycoonSummary(storage?: Pick<Storage, 'getItem'>): TycoonSummary {
  try {
    const raw = JSON.parse((storage ?? globalThis.localStorage).getItem(TYCOON_SAVE_KEY) ?? 'null') as unknown;
    return summarizeSave(raw);
  } catch { return summarizeSave(null); }
}
