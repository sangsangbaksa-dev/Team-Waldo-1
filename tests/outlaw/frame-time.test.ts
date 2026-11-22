import { describe, expect, it } from 'vitest';
import { outlawWorldDelta } from '../../src/outlaw/frame-time';

describe('OUTLAW physics/animation clock consistency', () => {
  it('freezes both city weather and physics when the pause or shop modal opens', () => {
    expect(outlawWorldDelta(1/60, true, false, false, false)).toBe(0);
    expect(outlawWorldDelta(.1, true, false, true, false)).toBe(0);
  });
  it('keeps live versus sessions and normal gameplay advancing', () => {
    expect(outlawWorldDelta(.1, true, true, false, false)).toBeCloseTo(.1);
    expect(outlawWorldDelta(.016, false, false, false, false)).toBeCloseTo(.016);
  });
  it('slows the rendered world at the same rate as the simulation', () => {
    expect(outlawWorldDelta(.1, false, false, true, false)).toBeCloseTo(.02);
    expect(outlawWorldDelta(.1, false, false, false, true)).toBeCloseTo(.045);
    expect(outlawWorldDelta(.1, false, false, true, true)).toBeCloseTo(.02);
  });
  it('prevents tab-resume spikes and malformed frame deltas', () => {
    for (const dt of [NaN, Infinity, -Infinity, -1, 0]) expect(outlawWorldDelta(dt, false, false, false, false)).toBe(0);
    expect(outlawWorldDelta(30, false, false, false, false)).toBe(.1);
  });
});
