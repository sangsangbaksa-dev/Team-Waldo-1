// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPreferences, writePreferences, readCareer, recordMatch } from '../../src/battle/preferences';

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
  it('uses accessible defaults when matchMedia is missing or blocked', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(readPreferences()).toEqual({ quality: 'standard', sound: true, reducedMotion: false });
    localStorage.setItem(KEY, JSON.stringify({ quality: 'low', sound: false, reducedMotion: true }));
    expect(readPreferences()).toEqual({ quality: 'low', sound: false, reducedMotion: true });
    localStorage.removeItem(KEY);
    vi.stubGlobal('matchMedia', () => { throw new Error('Media queries blocked'); });
    expect(readPreferences()).toEqual({ quality: 'standard', sound: true, reducedMotion: false });
  });
});

describe('career storage resilience', () => {
  it('ignores non-finite and negative scores instead of corrupting the career record', () => {
    recordMatch(true, Number.NaN, -9);
    expect(readCareer()).toEqual({ matches: 1, wins: 1, bestSurvival: 0, bestKills: 0 });
    recordMatch(false, Number.POSITIVE_INFINITY, 1e12);
    expect(readCareer()).toEqual({ matches: 2, wins: 1, bestSurvival: 0, bestKills: 1e9 });
  });

  it('does not exceed the profile counter bounds', () => {
    localStorage.setItem('waldo.career.v1', JSON.stringify({ matches: 1e9, wins: 1e9, bestSurvival: 3, bestKills: 5 }));
    recordMatch(true, 9.8, 7.3);
    expect(readCareer()).toEqual({ matches: 1e9, wins: 1e9, bestSurvival: 9, bestKills: 7 });
  });
});
