// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPreferences, writePreferences } from '../../src/battle/preferences';

const KEY = 'waldo.preferences.v1';

function device(compact: boolean, reducedMotion = false): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 850px)' ? compact : query === '(prefers-reduced-motion: reduce)' && reducedMotion,
  }));
}

beforeEach(() => { localStorage.clear(); device(false); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('graphics preference compatibility', () => {
  it.each(['high', 'standard'] as const)('preserves existing %s preferences without a migration', quality => {
    const previous = { quality, sound: false, reducedMotion: true };
    localStorage.setItem(KEY, JSON.stringify(previous));
    expect(readPreferences()).toEqual(previous);
  });

  it('persists low quality for both future battles and live preference listeners', () => {
    const stored = { quality: 'low' as const, sound: true, reducedMotion: false };
    const observe = vi.fn(() => readPreferences());
    window.addEventListener('waldo:preferences', observe);
    try {
      writePreferences(stored);
      expect(readPreferences()).toEqual(stored);
      expect(observe).toHaveBeenCalledTimes(1);
      expect(observe.mock.results[0].value).toEqual(stored);
      // The stored choice takes precedence when the user changes viewport/device defaults.
      device(true, true);
      expect(readPreferences()).toEqual(stored);
    } finally { window.removeEventListener('waldo:preferences', observe); }
  });

  it.each([
    { compact: false, reducedMotion: false, quality: 'standard' },
    { compact: true, reducedMotion: true, quality: 'standard' },
  ])('keeps the existing $quality default until explicitly selected', ({ compact, reducedMotion, quality }) => {
    device(compact, reducedMotion);
    expect(readPreferences()).toEqual({ quality, sound: true, reducedMotion });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('falls back for unknown quality while preserving valid independent settings', () => {
    device(true, true);
    localStorage.setItem(KEY, JSON.stringify({ quality: 'ultra', sound: false, reducedMotion: false }));
    expect(readPreferences()).toEqual({ quality: 'standard', sound: false, reducedMotion: false });
  });

  it('uses safe defaults for malformed stored data and invalid setting types', () => {
    for (const damaged of ['{invalid', 'null', '[]', JSON.stringify({ quality: 0, sound: 'false', reducedMotion: 1 })]) {
      localStorage.setItem(KEY, damaged);
      expect(readPreferences()).toEqual({ quality: 'standard', sound: true, reducedMotion: false });
    }
  });
});
