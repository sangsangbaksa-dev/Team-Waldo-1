import { describe, expect, it } from 'vitest';
import { trafficSpeedFactor } from '../../src/tycoon/scene/people';

describe('HUSTLE traffic safe following', () => {
  it('stops inside safety distance and reaches full speed outside braking range', () => {
    expect(trafficSpeedFactor(-1)).toBe(0);
    expect(trafficSpeedFactor(3)).toBe(0);
    expect(trafficSpeedFactor(7.5)).toBeCloseTo(0.5);
    expect(trafficSpeedFactor(12)).toBe(1);
    expect(trafficSpeedFactor(40)).toBe(1);
  });
});
