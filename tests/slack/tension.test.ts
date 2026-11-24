import { describe, expect, it } from 'vitest';
import { tensionView } from '../../src/slack/domain/tension';
import { studyClock } from '../../src/slack/domain/clock-face';

describe('slack tension readout', () => {
  it('stays quiet below the warning band and heats up past 70', () => {
    const calm = tensionView(10);
    expect(calm.heartbeat).toBe(false);
    expect(calm.hot).toBe(false);
    expect(calm.danger).toBe(0);
    const hot = tensionView(100);
    expect(hot.hot).toBe(true);
    expect(hot.heartbeat).toBe(true);
    expect(hot.beatInterval).toBeCloseTo(0.5, 5);
    expect(hot.danger).toBe(1);
  });
});

describe('classroom clock', () => {
  it('starts at 10:24 and advances one minute per sixty seconds', () => {
    expect(studyClock(0)).toBe('10:24');
    expect(studyClock(59)).toBe('10:24');
    expect(studyClock(60)).toBe('10:25');
    expect(studyClock(Number.NaN)).toBe('10:24');
  });
});
