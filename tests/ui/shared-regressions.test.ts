// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CITY_KEY, RTS_KEY, fmtTime, readCityCareer, readRtsRecords } from '../../src/records';
import { readCareer, readPreferences, recordMatch } from '../../src/prefs';
import { SHOOTER_KEY, readShooterCareer, recordShooterMatch } from '../../src/shooter/records';
import { retry, showLoading } from '../../src/loading';

beforeEach(() => localStorage.clear());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('shared regression fixes', () => {
  it('loads saved preferences even without a working matchMedia', () => {
    localStorage.setItem('waldo.preferences.v1', JSON.stringify({ sound: false, quality: 'low' }));
    vi.stubGlobal('matchMedia', undefined);
    expect(readPreferences()).toEqual({ sound: false, quality: 'low', reducedMotion: false });
    vi.stubGlobal('matchMedia', () => { throw new Error('blocked'); });
    expect(readPreferences().quality).toBe('low');
  });
  it('normalizes impossible win counts in all career readers', () => {
    for (const key of [CITY_KEY, RTS_KEY, SHOOTER_KEY, 'waldo.career.v1']) {
      localStorage.setItem(key, JSON.stringify({ matches: 2, wins: 9 }));
    }
    for (const read of [readCityCareer, readRtsRecords, readShooterCareer, readCareer]) {
      expect(read()).toMatchObject({ matches: 2, wins: 2 });
    }
  });
  it('keeps previous records when new scores are non-finite', () => {
    recordMatch(true, 20, 5);
    recordMatch(false, NaN, Infinity);
    expect(readCareer()).toEqual({ matches: 2, wins: 1, bestSurvival: 20, bestKills: 5 });
    recordShooterMatch(true, 7);
    recordShooterMatch(false, NaN);
    expect(readShooterCareer()).toMatchObject({ matches: 2, wins: 1, bestKills: 7 });
  });
  it('carries milliseconds into the next minute and rejects invalid times', () => {
    expect(fmtTime(59.9996)).toBe('1:00.000');
    expect(fmtTime(119.9999)).toBe('2:00.000');
    expect(fmtTime(61.234)).toBe('1:01.234');
    expect(fmtTime(-1)).toBe('--:--.---');
    expect(fmtTime(Infinity)).toBe('--:--.---');
  });
  it('does not let invalid loading progress poison later valid updates', () => {
    const screen = showLoading('test');
    screen.progress(NaN);
    screen.progress(0.5);
    expect(document.querySelector('.ld-pct')?.textContent).toBe('50%');
    screen.close();
  });
  it('does not restart a request after cancellation during backoff', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const task = vi.fn(async () => { throw new Error('offline'); });
    const result = expect(retry(task, { cancelled: () => cancelled })).rejects.toThrow('offline');
    await Promise.resolve();
    cancelled = true;
    await vi.runAllTimersAsync();
    await result;
    expect(task).toHaveBeenCalledTimes(1);
  });
});
