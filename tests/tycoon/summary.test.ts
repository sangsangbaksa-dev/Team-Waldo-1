// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readTycoonSummary, STAGE_NAMES, TYCOON_SAVE_KEY } from '../../src/tycoon/core/summary';
import { readTycoonSummary as readFromSave } from '../../src/tycoon/core/save';
afterEach(() => localStorage.clear());

describe('lightweight HUSTLE homepage summary', () => {
  it('retains the previous summary contract and public save key', () => {
    expect(TYCOON_SAVE_KEY).toBe('waldo.tycoon.v1');
    expect(readFromSave).toBe(readTycoonSummary);
    expect(STAGE_NAMES.corp).toBe('대기업 회장');
    expect(readTycoonSummary()).toEqual({ has: false, cash: 0, stage: 'broke', day: 1, won: false });
  });
  it('reads a versioned save without loading world state', () => {
    localStorage.setItem(TYCOON_SAVE_KEY, JSON.stringify({ v: 1, cash: 1500, stage: 'business', day: 18.7, won: false }));
    expect(readTycoonSummary()).toEqual({ has: true, cash: 1500, stage: 'business', day: 19, won: false });
  });
  it('sanitizes corrupted values and does not accept unsupported save versions', () => {
    for (const saved of ['{invalid', 'null', '{"v":2,"cash":999}', '[]']) {
      localStorage.setItem(TYCOON_SAVE_KEY, saved);
      expect(readTycoonSummary().has).toBe(false);
    }
    localStorage.setItem(TYCOON_SAVE_KEY, JSON.stringify({ v: 1, cash: 'x', stage: '__proto__', day: -9, won: 'yes' }));
    expect(readTycoonSummary()).toEqual({ has: true, cash: 0, stage: 'broke', day: 1, won: false });
  });
  it('reads from explicitly supplied storage', () => {
    const storage = {
      getItem: (key: string) => key === TYCOON_SAVE_KEY ? JSON.stringify({ v: 1, stage: 'world', day: 7, won: true }) : null,
    } as Storage;
    expect(readTycoonSummary(storage)).toMatchObject({ has: true, stage: 'world', day: 7, won: true });
  });
});
