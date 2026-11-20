import { describe, expect, it } from 'vitest';
import { fmtTime } from '../../src/records';

describe('race time display', () => {
  it.each([
    [0, '0:00.000'],
    [9.9996, '0:10.000'],
    [59.9996, '1:00.000'],
    [60.123, '1:00.123'],
    [119.9996, '2:00.000'],
    [3600, '60:00.000'],
  ])('formats %s as %s', (seconds, expected) => {
    expect(fmtTime(seconds as number)).toBe(expected);
  });
  it.each([-1, NaN, Infinity, -Infinity, Number.MAX_VALUE])('rejects invalid time %s', (seconds) => {
    expect(fmtTime(seconds)).toBe('--:--.---');
  });
});
