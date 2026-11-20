import { describe, expect, it } from 'vitest';
import { dragSteer, wheelPixels, WheelGesture } from '../../src/shared/input';

describe('precision input', () => {
  it('normalizes pixel, line and page wheel events', () => {
    expect(wheelPixels(4, 0)).toBe(4);
    expect(wheelPixels(-2, 1)).toBe(-32);
    expect(wheelPixels(1, 2, 600)).toBe(600);
    expect(wheelPixels(NaN, 0)).toBe(0);
  });
  it('accumulates small trackpad deltas and ignores inertia until quiet', () => {
    const wheel = new WheelGesture();
    expect([0, 15, 30, 45, 60].map(t => wheel.push(4, t))).toEqual([0, 0, 0, 0, 1]);
    expect([100, 220, 360, 500].map(t => wheel.push(12, t))).toEqual([0, 0, 0, 0]);
    expect(wheel.push(100, 700)).toBe(1);
  });
  it('allows intentional reversal and ignores pinch zoom', () => {
    const wheel = new WheelGesture();
    expect(wheel.push(50, 0, true)).toBe(0);
    expect(wheel.push(40, 10)).toBe(1);
    expect(wheel.push(-2, 20)).toBe(0);
    expect(wheel.push(-30, 30)).toBe(-1);
    expect(wheel.push(-30, 40)).toBe(0);
  });
  it('clears gesture state on focus loss or new match', () => {
    const wheel = new WheelGesture();
    expect(wheel.push(40, 0)).toBe(1);
    wheel.reset();
    expect(wheel.push(40, 1)).toBe(1);
    expect(wheel.push(Infinity, 2)).toBe(0);
  });
  it('steers with a neutral zone, bounded magnitude and symmetry', () => {
    expect(dragSteer(4)).toBe(0);
    expect(dragSteer(52.5)).toBe(0.5);
    expect(dragSteer(-52.5)).toBe(-0.5);
    expect(dragSteer(500)).toBe(1);
    expect(dragSteer(NaN)).toBe(0);
    expect(dragSteer(4, 5, 5)).toBe(0);
  });
});
