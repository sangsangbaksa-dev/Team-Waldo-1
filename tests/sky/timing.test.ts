import { describe, expect, it } from 'vitest';
import { planSkyFrame } from '../../src/sky/timing';

describe('SKY WAR frame pacing', () => {
  it('keeps ordinary 60fps frames at one simulation tick', () => {
    const plan = planSkyFrame(1000 / 60);
    expect(plan.steps).toBe(1);
    expect(plan.stepDt).toBeCloseTo(1 / 60);
    expect(plan.elapsed).toBeCloseTo(1 / 60);
  });
  it('catches up to a 100ms frame using two stable 50ms steps', () => {
    const plan = planSkyFrame(100);
    expect(plan.steps).toBe(2);
    expect(plan.stepDt).toBeCloseTo(0.05);
    expect(plan.elapsed).toBeCloseTo(0.1);
  });
  it('caps background tab gaps at 200ms and no physics tick exceeds 50ms', () => {
    for (const ms of [17, 49, 66, 150, 240, 10000]) {
      const plan = planSkyFrame(ms);
      expect(plan.steps).toBeGreaterThanOrEqual(1);
      expect(plan.steps).toBeLessThanOrEqual(4);
      expect(plan.stepDt).toBeLessThanOrEqual(0.05 + Number.EPSILON);
      expect(plan.steps * plan.stepDt).toBeCloseTo(Math.min(ms / 1000, 0.2));
    }
  });
  it('never feeds nonfinite/negative time into physics', () => {
    for (const invalid of [NaN, Infinity, -Infinity, -30, 0]) {
      expect(planSkyFrame(invalid)).toEqual({ elapsed: 0, steps: 0, stepDt: 0 });
    }
  });
});
