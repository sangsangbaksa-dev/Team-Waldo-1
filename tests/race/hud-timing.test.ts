import { describe, expect, it } from 'vitest';
import { advanceWrongWay, WRONG_WAY_DELAY } from '../../src/race/hud-timing';

describe('SPEED RUSH wrong-way timing', () => {
  it.each([30, 60, 90, 144])('shows consistently at %i updates per second', fps => {
    let elapsed = 0;
    for (let i = 0; i < Math.floor(fps * 0.3); i++) elapsed = advanceWrongWay(elapsed, true, -12, 1 / fps);
    expect(elapsed).toBeLessThan(WRONG_WAY_DELAY);
    for (let i = 0; i < Math.ceil(fps * 0.1); i++) elapsed = advanceWrongWay(elapsed, true, -12, 1 / fps);
    expect(elapsed).toBe(WRONG_WAY_DELAY);
  });
  it('resets when moving forward or not racing and ignores invalid time', () => {
    expect(advanceWrongWay(0.35, true, 3, 0.05)).toBe(0);
    expect(advanceWrongWay(0.35, false, -12, 0.05)).toBe(0);
    expect(advanceWrongWay(0.1, true, -12, NaN)).toBe(0.1);
  });
});
