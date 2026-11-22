import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readRecords, saveResult } from '../src/squad/records';

const KEY = 'team-waldo-squad-records-v1';
let data: Map<string, string>;

beforeEach(() => {
  data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('squad records', () => {
  it('preserves valid records and adds completed wins', () => {
    data.set(KEY, JSON.stringify({ matches: 3, wins: 2 }));
    expect(readRecords()).toEqual({ matches: 3, wins: 2 });
    saveResult(true);
    expect(readRecords()).toEqual({ matches: 4, wins: 3 });
    saveResult(false);
    expect(readRecords()).toEqual({ matches: 5, wins: 3 });
  });

  it('ignores invalid counts and caps wins to completed matches', () => {
    data.set(KEY, JSON.stringify({ matches: -4, wins: 99 }));
    expect(readRecords()).toEqual({ matches: 0, wins: 0 });
    data.set(KEY, JSON.stringify({ matches: 2.5, wins: '2' }));
    expect(readRecords()).toEqual({ matches: 0, wins: 0 });
    data.set(KEY, JSON.stringify({ matches: 4, wins: 20 }));
    expect(readRecords()).toEqual({ matches: 4, wins: 4 });
    data.set(KEY, '{corrupted');
    expect(readRecords()).toEqual({ matches: 0, wins: 0 });
  });

  it('survives disabled storage without crashing gameplay', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readRecords()).toEqual({ matches: 0, wins: 0 });
    expect(() => saveResult(true)).not.toThrow();
  });
});
