import type { TycoonCore } from '../core/types';
import { TYCOON_SAVE_KEY } from './save-summary';
export { TYCOON_SAVE_KEY, readTycoonSummary } from './save-summary';

function store(storage?: Storage): Storage | null {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}

/** 저장된 판을 읽는다(없거나 깨졌으면 null) */
export function loadTycoon(storage?: Storage): unknown {
  try {
    const raw = store(storage)?.getItem(TYCOON_SAVE_KEY);
    return raw ? JSON.parse(raw) as unknown : null;
  } catch { return null; }
}

export function saveTycoon(core: Pick<TycoonCore, 'serialize'>, storage?: Storage): boolean {
  try { store(storage)?.setItem(TYCOON_SAVE_KEY, JSON.stringify(core.serialize())); return true; } catch { return false; }
}

export function clearTycoon(storage?: Storage): void {
  try { store(storage)?.removeItem(TYCOON_SAVE_KEY); } catch { /* 무시 */ }
}
