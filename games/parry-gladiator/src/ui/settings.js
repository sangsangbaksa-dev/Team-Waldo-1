const STORAGE_KEY = 'parry-gladiator.settings.v1';
const defaults = {
  volume: 0.55,
  muted: false,
  motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full',
  quality: 'auto',
  difficulty: 'gladiator',
  server: '',
};

export function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const result = { ...defaults };
    if (Number.isFinite(saved.volume)) result.volume = Math.max(0, Math.min(1, saved.volume));
    if (typeof saved.muted === 'boolean') result.muted = saved.muted;
    if (['full', 'reduced'].includes(saved.motion)) result.motion = saved.motion;
    if (['auto', 'high', 'low'].includes(saved.quality)) result.quality = saved.quality;
    if (['squire', 'gladiator', 'champion'].includes(saved.difficulty)) result.difficulty = saved.difficulty;
    if (typeof saved.server === 'string') result.server = saved.server;
    return result;
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Storage can be disabled. */ }
}
