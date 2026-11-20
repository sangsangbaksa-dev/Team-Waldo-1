import { describe, expect, it } from 'vitest';
import { advanceFastForward } from '../../src/shooter/frame-budget';

function target(end = Infinity) {
  let steps = 0, drains = 0;
  return {
    get over() { return steps >= end; },
    get steps() { return steps; },
    get drains() { return drains; },
    step(dt: number) { expect(dt).toBe(1 / 30); steps++; },
    drain() { drains++; },
  };
}

describe('bounded fast-forward', () => {
  it('limits work even when the clock does not advance', () => {
    const m = target();
    expect(advanceFastForward(m, 500, () => 0, 7, 120)).toBe(380);
    expect(m.steps).toBe(120);
    expect(m.drains).toBe(120);
  });

  it('stops at the time budget', () => {
    const m = target();
    let time = 0;
    expect(advanceFastForward(m, 100, () => time++, 4, 120)).toBe(96);
  });

  it('stops as soon as the match is over', () => {
    const m = target(3);
    expect(advanceFastForward(m, 100, () => 0)).toBe(97);
    expect(m.drains).toBe(3);
  });

  it('does not run extra steps after remaining work is exhausted', () => {
    const m = target();
    expect(advanceFastForward(m, 2, () => 0)).toBe(0);
    expect(advanceFastForward(m, 0, () => 0)).toBe(0);
    expect(m.steps).toBe(2);
  });
});
