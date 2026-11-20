// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CITY_KEY, RTS_KEY, readCityCareer, readRtsRecords, readRaceRecords, fmtTime } from '../../src/records';
import { SHOOTER_KEY, readShooterCareer, recordShooterMatch } from '../../src/shooter/records';
import { OUTLAW_KEY, readOutlawSummary } from '../../src/outlaw/records';
import { readPreferences } from '../../src/prefs';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe('arcade record resilience', () => {
  it('never reports more victories than completed matches', () => {
    for (const key of [CITY_KEY, RTS_KEY, SHOOTER_KEY]) localStorage.setItem(key, JSON.stringify({ matches: 3, wins: 9 }));
    expect(readCityCareer().wins).toBe(3);
    expect(readRtsRecords().wins).toBe(3);
    expect(readShooterCareer().wins).toBe(3);
  });
  it('preserves the best kill count when a new score is invalid', () => {
    recordShooterMatch(true, 7);
    recordShooterMatch(false, Number.NaN);
    expect(readShooterCareer()).toMatchObject({ matches: 2, wins: 1, bestKills: 7 });
  });
  it('rounds the race clock across the seconds and minute boundaries', () => {
    expect(fmtTime(9.9996)).toBe('0:10.000');
    expect(fmtTime(59.9996)).toBe('1:00.000');
    expect(fmtTime(-1)).toBe('--:--.---');
    expect(fmtTime(Infinity)).toBe('--:--.---');
  });
  it('rejects malformed timing tables and inherited object keys', () => {
    localStorage.setItem('waldo.race.v2', '{"bestLap":{"sunset":12.3,"constructor":1,"toString":2},"bestRace":[4]}');
    expect(readRaceRecords().bestLap).toEqual({ sunset: 12.3 });
    expect(readRaceRecords().bestRace).toEqual({});
  });
  it('rejects invalid Outlaw summaries and deduplicates progress', () => {
    localStorage.setItem(OUTLAW_KEY, '[]');
    expect(readOutlawSummary().has).toBe(false);
    localStorage.setItem(OUTLAW_KEY, JSON.stringify({ v: 1, cash: -50, completed: ['a', 'a', 1], stunts: [0, 0, -1, 'x'], guns: [], collected: [] }));
    expect(readOutlawSummary()).toEqual({ has: true, cash: 0, missions: 1, stunts: 1 });
  });
  it('can open the arcade with blocked or missing media queries', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(readPreferences()).toEqual({ sound: true, quality: 'standard', reducedMotion: false });
    vi.stubGlobal('matchMedia', () => { throw new Error('blocked'); });
    expect(readPreferences()).toEqual({ sound: true, quality: 'standard', reducedMotion: false });
  });
});
