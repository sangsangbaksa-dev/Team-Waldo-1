import { describe, expect, it } from 'vitest';
import { acceptWheelSwap, newWheelSwapState } from '../../src/shooter/wheel';

describe('ZERO ZONE mouse and trackpad weapon switching', () => {
  it('switches on one mouse-wheel notch, not each follow-up delta', () => {
    const st = newWheelSwapState();
    expect(acceptWheelSwap(st, 100, 0, 100)).toBe(true);
    expect(acceptWheelSwap(st, 100, 0, 145)).toBe(false);
    expect(acceptWheelSwap(st, 100, 0, 235)).toBe(false);
    expect(acceptWheelSwap(st, 100, 0, 490)).toBe(true);
  });

  it('accumulates tiny touchpad scrolls and triggers once per gesture', () => {
    const st = newWheelSwapState();
    let count = 0;
    for (let i = 0; i < 40; i++) if (acceptWheelSwap(st, 3.1, 0, i * 10)) count++;
    expect(count).toBe(1);
    expect(acceptWheelSwap(st, 5, 0, 800)).toBe(false);
    for (let i = 0; i < 24; i++) if (acceptWheelSwap(st, 3.1, 0, 810 + i * 8)) count++;
    expect(count).toBe(2);
  });

  it('re-arms after scroll direction reverses and normalizes line/page modes', () => {
    const st = newWheelSwapState();
    expect(acceptWheelSwap(st, 5, 1, 50)).toBe(true);
    expect(acceptWheelSwap(st, -5, 1, 65)).toBe(true);
    expect(acceptWheelSwap(st, -0.3, 2, 600)).toBe(true);
  });

  it('does not consume an attempt on zero, NaN or Infinity deltas', () => {
    const st = newWheelSwapState();
    expect(acceptWheelSwap(st, NaN, 0, 20)).toBe(false);
    expect(acceptWheelSwap(st, Infinity, 0, 21)).toBe(false);
    expect(acceptWheelSwap(st, 0, 0, 22)).toBe(false);
    expect(acceptWheelSwap(st, 80, 0, 23)).toBe(true);
  });
});
