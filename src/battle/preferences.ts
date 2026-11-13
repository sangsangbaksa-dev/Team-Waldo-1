export interface Preferences { sound: boolean; quality: 'high' | 'standard' | 'low'; reducedMotion: boolean; }
const KEY = 'waldo.preferences.v1';
export function readPreferences(): Preferences {
  const defaults: Preferences = { sound: true, quality: 'standard', reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { sound: typeof saved.sound === 'boolean' ? saved.sound : defaults.sound,
      quality: saved.quality === 'high' || saved.quality === 'standard' || saved.quality === 'low' ? saved.quality : defaults.quality,
      reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : defaults.reducedMotion };
  } catch { return defaults; }
}
export function writePreferences(value: Preferences): void {
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Settings are optional. */ }
  window.dispatchEvent(new Event('waldo:preferences'));
}

export interface Career { matches: number; wins: number; bestSurvival: number; bestKills: number; }
const CAREER_KEY = 'waldo.career.v1';
export function readCareer(): Career {
  const career = { matches: 0, wins: 0, bestSurvival: 0, bestKills: 0 };
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CAREER_KEY) ?? '{}');
    if (typeof raw !== 'object' || raw === null) return career;
    for (const key of Object.keys(career) as (keyof Career)[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e9) career[key] = Math.floor(v);
    }
  } catch { /* A fresh profile is always playable. */ }
  return career;
}
export function recordMatch(victory: boolean, seconds: number, kills: number): void {
  const c = readCareer();
  c.matches++; c.wins += Number(victory); c.bestSurvival = Math.max(c.bestSurvival, Math.floor(seconds)); c.bestKills = Math.max(c.bestKills, kills);
  try { localStorage.setItem(CAREER_KEY, JSON.stringify(c)); } catch { /* Do not block results. */ }
}
