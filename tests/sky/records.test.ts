import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSkyRecords, readSkySummary, recordSkyRun, SKY_KEY } from '../../src/sky/records';

class MemoryStorage {
  readonly entries = new Map<string, string>();
  getItem(key: string): string | null { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string): void { this.entries.set(key, value); }
}

let memory: MemoryStorage;
beforeEach(() => { memory = new MemoryStorage(); vi.stubGlobal('localStorage', memory); });
afterEach(() => vi.unstubAllGlobals());

describe('SKY WAR 기록 저장 안정성', () => {
  it('기록이 없거나 잘못된 JSON이면 안전한 초기 기록을 돌려준다', () => {
    expect(readSkyRecords().runs).toBe(0);
    memory.setItem(SKY_KEY, '{invalid');
    expect(readSkyRecords()).toEqual({ runs: 0, bestScore: 0, bestWave: 0, kills: 0, bestCombo: 0, longestTime: 0 });
    expect(readSkySummary().has).toBe(false);
  });

  it('Infinity, 음수, NaN, 비정상적인 큰 값과 실수 횟수를 정규화한다', () => {
    memory.setItem(SKY_KEY, JSON.stringify({
      runs: 2.9, bestScore: 'Infinity', bestWave: -100, kills: 1e200,
      bestCombo: 'NaN', longestTime: -2.5,
    }));
    const r = readSkyRecords();
    expect(r.runs).toBe(2);
    expect(r.bestScore).toBe(0);
    expect(r.bestWave).toBe(0);
    expect(r.kills).toBe(Number.MAX_SAFE_INTEGER);
    expect(r.bestCombo).toBe(0);
    expect(r.longestTime).toBe(0);
    expect(Object.values(r).every(Number.isFinite)).toBe(true);
  });

  it('기록은 출격마다 한 번씩 누적하고 최고 점수·웨이브·콤보·시간은 최대값을 유지한다', () => {
    recordSkyRun(300, 2, 4, 2, 45);
    recordSkyRun(100, 1, 2, 1, 12);
    expect(readSkyRecords()).toEqual({ runs: 2, bestScore: 300, bestWave: 2, kills: 6, bestCombo: 2, longestTime: 45 });
    expect(readSkySummary()).toEqual({ has: true, bestScore: 300, bestWave: 2 });
  });

  it('비정상적인 입력을 저장해도 기록이 Infinity나 음수가 되지 않는다', () => {
    recordSkyRun(Infinity, -3, Number.NaN, -2, Infinity);
    recordSkyRun(200, 2, 1, 3, 90.5);
    const r = readSkyRecords();
    expect(r).toEqual({ runs: 2, bestScore: 200, bestWave: 2, kills: 1, bestCombo: 3, longestTime: 90.5 });
  });

  it('브라우저 저장소가 차단된 환경에서도 예외가 전파되지 않는다', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('private mode'); }, setItem: () => { throw new Error('private mode'); } });
    expect(readSkyRecords().runs).toBe(0);
    expect(() => recordSkyRun(100, 1, 1)).not.toThrow();
  });
});
