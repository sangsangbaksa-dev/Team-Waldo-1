import { describe, expect, it } from 'vitest';
import { clampLabelScreenPos, WeaponWheel, wheelPixels } from '../../src/city/uiMath';

describe('LAST CITY trackpad controls', () => {
  it('normalizes wheel units and bounds large deltas', () => {
    expect(wheelPixels(3, 1, 500)).toBe(48);
    expect(wheelPixels(-1, 2, 500)).toBe(-240);
    expect(wheelPixels(NaN, 0, 500)).toBe(0);
  });
  it('accumulates small deltas but limits rapid weapon changes', () => {
    const wheel = new WeaponWheel();
    expect(wheel.push(15, 0)).toBe(0);
    expect(wheel.push(15, 20)).toBe(0);
    expect(wheel.push(15, 40)).toBe(1);
    expect(wheel.push(100, 50)).toBe(0);
    expect(wheel.push(-48, 200)).toBe(-1);
    wheel.reset();
    expect(wheel.push(100, 210)).toBe(1);
  });
  it('discards stale partial scrolls and reversals', () => {
    const wheel = new WeaponWheel();
    expect(wheel.push(30, 0)).toBe(0);
    expect(wheel.push(20, 250)).toBe(0);
    expect(wheel.push(-25, 260)).toBe(0);
    expect(wheel.push(-15, 270)).toBe(-1);
  });
  it('centers oversized labels on small screens', () => {
    expect(clampLabelScreenPos(0, 0, 100, 40, 140, 60)).toEqual({ x: 50, y: 20 });
  });
});
