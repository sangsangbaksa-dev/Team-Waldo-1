import { describe, expect, it } from 'vitest';
import { FxEmissionBudget } from '../../src/race/fx-emission';

const simulatedParticles = (fps: number, rate: number, seconds = 3): number => {
  const fx = new FxEmissionBudget(2);
  let total = 0;
  for (let frame = 0; frame < fps * seconds; frame++) total += fx.take(0, rate, 1 / fps, 140);
  return total;
};

describe('SPEED RUSH refresh-independent FX emission', () => {
  it('produces equivalent smoke and wall sparks at 20, 30, 60, 90 and 144 Hz', () => {
    for (const rate of [30, 54, 60, 180]) {
      const expected = rate * 3;
      for (const fps of [20, 30, 60, 90, 144]) {
        expect(Math.abs(simulatedParticles(fps, rate) - expected)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('keeps storm rain density consistent down to 20 Hz', () => {
    const expected = 2040 * 3;
    for (const fps of [20, 30, 60, 90, 144]) {
      expect(Math.abs(simulatedParticles(fps, 2040) - expected)).toBeLessThanOrEqual(2);
    }
  });

  it('drops excessive catchup bursts after a suspended tab', () => {
    const fx = new FxEmissionBudget(2);
    expect(fx.take(0, 2040, 5, 70)).toBe(70);
    expect(fx.take(0, 2040, 5, 70)).toBe(70);
    expect(fx.take(0, 0, 0.016)).toBe(0);
    expect(fx.take(0, 30, 1 / 60)).toBe(0);
  });

  it('does not leak fractional emission credit across cars and effects', () => {
    const fx = new FxEmissionBudget(3);
    expect(fx.take(0, 30, 1 / 60)).toBe(0);
    expect(fx.take(1, 30, 1 / 60)).toBe(0);
    expect(fx.take(0, 30, 1 / 60)).toBe(1);
    expect(fx.take(1, 30, 1 / 60)).toBe(1);
    expect(fx.take(1, 0, 1 / 60)).toBe(0);
    expect(fx.take(1, 30, 1 / 60)).toBe(0);
    expect(fx.take(-1, 30, 1 / 60)).toBe(0);
  });
});
