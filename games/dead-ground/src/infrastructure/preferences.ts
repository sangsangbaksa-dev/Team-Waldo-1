const PREFIX = 'dead-ground.';

export function readPreference(key: string): string | null {
  try { return localStorage.getItem(PREFIX + key); } catch { return null; }
}

export function writePreference(key: string, value: string): void {
  try { localStorage.setItem(PREFIX + key, value); } catch { /* Storage is optional. */ }
}
