import { describe, expect, it } from 'vitest';
import { FrameGate } from '../src/shared/frame-gate';

describe('FrameGate', () => {
  it('runs immediately and limits subsequent work', () => {
    const gate = new FrameGate(50);
    expect([0, 16, 49, 50, 99, 100].map(t => gate.due(t))).toEqual([true, false, false, true, false, true]);
  });
  it('does not catch up in bursts and can reset on a new match', () => {
    const gate = new FrameGate(50);
    expect(gate.due(100)).toBe(true);
    expect(gate.due(10000)).toBe(true);
    expect(gate.due(10001)).toBe(false);
    gate.reset();
    expect(gate.due(0)).toBe(true);
  });
  it('rejects invalid intervals and ignores non-finite timestamps', () => {
    expect(() => new FrameGate(0)).toThrow(RangeError);
    expect(new FrameGate(50).due(NaN)).toBe(false);
  });
});
