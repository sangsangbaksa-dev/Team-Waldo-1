import { describe, expect, it } from 'vitest';
import { breathLabel, meterScale, threatLabel, threatLevel } from '../../src/room-tone/presence.mjs';

describe('ROOM TONE presence readout', () => {
  it('names threat bands and keeps the meter inside 0..1', () => {
    expect(threatLabel(0)).toBe('안정');
    expect(threatLevel(0.4)).toBe('close');
    expect(threatLabel(0.9)).toBe('바로 근처');
    expect(threatLevel(0.9)).toBe('near');
    expect(meterScale(1.4)).toBe('1.000');
    expect(meterScale(Number.NaN)).toBe('0.000');
  });
  it('separates a sprint, a winded pause, and holding breath', () => {
    expect(breathLabel(false, false, true)).toBe('질주');
    expect(breathLabel(false, true, true)).toBe('숨 고름');
    expect(breathLabel(true, false, false)).toBe('숨죽임');
  });
});