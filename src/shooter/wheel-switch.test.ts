import { describe, expect, it } from 'vitest';
import { WheelSwapGate } from './wheel-switch';

describe('ZERO ZONE wheel / trackpad weapon switching', () => {
  it('accumulates tiny trackpad pixels into one weapon swap', () => {
    const gate = new WheelSwapGate();
    expect(gate.feed(2, 0)).toBe(false);
    expect(gate.feed(2, 10)).toBe(false);
    expect(gate.feed(2, 20)).toBe(false);
    expect(gate.feed(2, 30)).toBe(false);
    expect(gate.feed(2, 40)).toBe(true);
    expect(gate.feed(20, 50)).toBe(false);
  });

  it('ignores inertia but permits a new gesture after a pause', () => {
    const gate = new WheelSwapGate();
    expect(gate.feed(100, 0)).toBe(true);
    expect(gate.feed(1, 60)).toBe(false);
    expect(gate.feed(1, 250)).toBe(false);
    expect(gate.feed(-30, 280)).toBe(false);
    expect(gate.feed(-100, 501)).toBe(true);
  });

  it('normalizes line/page scroll and handles opposite trackpad directions', () => {
    const gate = new WheelSwapGate();
    expect(gate.feed(1, 0, 1)).toBe(true);
    gate.reset();
    expect(gate.feed(-1, 0, 2)).toBe(true);
    gate.reset();
    expect(gate.feed(7, 0)).toBe(false);
    expect(gate.feed(-5, 20)).toBe(false);
    expect(gate.feed(8, 40)).toBe(true);
  });

  it('rejects invalid input and can be reset when a new match starts', () => {
    const gate = new WheelSwapGate();
    expect(gate.feed(Infinity, 0)).toBe(false);
    expect(gate.feed(30, NaN)).toBe(false);
    expect(gate.feed(40, 0, 99)).toBe(false);
    expect(gate.feed(12, 1)).toBe(true);
    expect(gate.feed(12, 2)).toBe(false);
    gate.reset();
    expect(gate.feed(12, 3)).toBe(true);
  });
});
