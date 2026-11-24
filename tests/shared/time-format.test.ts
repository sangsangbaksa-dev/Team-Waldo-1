import { describe, expect, it } from 'vitest';
import { fmtTime } from '../../src/records';

describe('shared race time formatter', () => {
  it('pads seconds and milliseconds for normal lap times', () => {
    expect(fmtTime(0)).toBe('0:00.000');
    expect(fmtTime(1.25)).toBe('0:01.250');
    expect(fmtTime(59.123)).toBe('0:59.123');
    expect(fmtTime(61.007)).toBe('1:01.007');
  });

  it('carries fractional rounding into minutes without invalid :60.000 seconds', () => {
    expect(fmtTime(59.9997)).toBe('1:00.000');
    expect(fmtTime(119.9996)).toBe('2:00.000');
    expect(fmtTime(3599.9997)).toBe('60:00.000');
    expect(fmtTime(59.9994)).toBe('0:59.999');
  });

  it('rounds non-boundary fractions consistently', () => {
    expect(fmtTime(1.23449)).toBe('0:01.234');
    expect(fmtTime(1.23451)).toBe('0:01.235');
    expect(fmtTime(60.0003)).toBe('1:00.000');
    expect(fmtTime(60.0007)).toBe('1:00.001');
  });

  it('uses a safe placeholder for non-finite, negative or unsafe times', () => {
    for (const input of [NaN, Infinity, -Infinity, -1, Number.MAX_SAFE_INTEGER]) {
      expect(fmtTime(input)).toBe('--:--.---');
    }
  });
});
