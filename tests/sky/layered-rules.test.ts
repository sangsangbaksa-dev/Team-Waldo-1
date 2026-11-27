import { describe, expect, it } from 'vitest';
import { advanceFlight, killPoints, terrainY, type FlightState } from '../../src/sky/domain/flight-rules';
import { createSkyRecords } from '../../src/sky/application/records';
import type { SkyRecords } from '../../src/sky/domain/records';
describe('SKY WAR domain and application', () => {
  it('calculates flight without a renderer', () => {
    const j: FlightState = { kind: 'fighter', team: 'player', boosting: false, speed: 140, pitch: 0, yaw: 0, roll: 0, g: 1 };
    advanceFlight(j, 0, 1, 0.55, 0.1, 0, 0);
    expect(j.roll).toBeGreaterThan(0); expect(j.yaw).toBeLessThan(0);
    expect(killPoints('ace', 3)).toBe(750); expect(terrainY(10000, 10000)).toBe(0);
  });
  it('records through a supplied store without localStorage', () => {
    let data: SkyRecords | undefined;
    const service = createSkyRecords({ read: () => data, write: r => { data = r; } });
    service.record({ score: 300, wave: 2, kills: 3, combo: 2, time: 20 });
    service.record({ score: 200, wave: 1, kills: 1, combo: 1, time: 10 });
    expect(service.read()).toEqual({ runs: 2, bestScore: 300, bestWave: 2, kills: 4, bestCombo: 2, longestTime: 20 });
  });
  it('handles unavailable or corrupted storage', () => {
    const service = createSkyRecords({ read: () => ({ runs: Infinity, bestScore: -1 }), write: () => { throw Error('unavailable'); } });
    expect(service.read().runs).toBe(0); expect(service.read().bestScore).toBe(0);
    expect(() => service.record({ score: 1, wave: 1, kills: 1, combo: 1, time: 1 })).not.toThrow();
  });
});
