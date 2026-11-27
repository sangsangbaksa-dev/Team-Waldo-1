export interface SkyControls { assist: number; sens: number; inv: boolean }
const key = 'waldo-sky-ctl';
export function readControls(): SkyControls {
  const defaults = { assist: 2, sens: 1, inv: false };
  try {
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    if (!data || typeof data !== 'object') return defaults;
    return {
      assist: Number.isInteger(data.assist) && data.assist >= 0 && data.assist <= 2 ? data.assist : defaults.assist,
      sens: typeof data.sens === 'number' && Number.isFinite(data.sens) && data.sens >= 0.6 && data.sens <= 1.6 ? data.sens : defaults.sens,
      inv: typeof data.inv === 'boolean' ? data.inv : defaults.inv,
    };
  } catch { return defaults; }
}
export function saveControls(controls: SkyControls): void { try { localStorage.setItem(key, JSON.stringify(controls)); } catch { /* Storage is optional. */ } }
