import { describe, expect, it } from 'vitest';
import { scoreRun, gradeRun } from '../../src/slack/domain/scoring';
import { createSessionStats, advanceSession } from '../../src/slack/application/session-stats';
import { createSlackRecords } from '../../src/slack/application/records';
import { createSim } from '../../src/slack/sim';
describe('SLACK OFF domain and application', () => {
  it('preserves score and grade thresholds', () => {
    const s = { fun: 60, goal: 50, study: 50, strikes: 1, sus: 0 };
    expect(scoreRun(s, 20)).toBe(620);
    expect(gradeRun(s, 2, 1)).toBe('B');
    expect(gradeRun({ ...s, fun: 20 }, 2, 3)).toBe('D');
  });
  it('tracks actual elapsed play time and activity', () => {
    const sim = createSim('class', 10, 2), stats = createSessionStats();
    sim.start(); sim.doActivity('game'); sim.setCover(false);
    expect(advanceSession(sim, stats, 1).elapsed).toBeCloseTo(1);
    expect(stats.act.game).toBeCloseTo(1);
    sim.setCover(true); advanceSession(sim, stats, 1);
    expect(stats.act.game).toBeCloseTo(1);
  });
  it('retains a session record even when storage is unavailable', () => {
    const service = createSlackRecords({ read: () => { throw Error('blocked'); }, write: () => { throw Error('blocked'); } });
    expect(service.record('class', 20, 'A')).toBe(true);
    expect(service.record('class', 10, 'B')).toBe(false);
    expect(service.record('dorm', 30, 'S')).toBe(true);
    expect(service.read().best.class).toEqual({ score: 20, grade: 'A' });
    expect(service.read().best.dorm).toEqual({ score: 30, grade: 'S' });
  });
});
