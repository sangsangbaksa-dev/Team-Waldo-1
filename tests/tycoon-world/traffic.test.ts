import { describe, expect, it } from 'vitest';
import { trafficSpeedFactor } from '../../src/tycoon/scene/people';
import { intersectionFactor, signalAspect } from '../../src/tycoon/scene/signals';

describe('HUSTLE traffic safe following', () => {
  it('stops inside safety distance and reaches full speed outside braking range', () => {
    expect(trafficSpeedFactor(-1)).toBe(0);
    expect(trafficSpeedFactor(3)).toBe(0);
    expect(trafficSpeedFactor(7.5)).toBeCloseTo(0.5);
    expect(trafficSpeedFactor(12)).toBe(1);
    expect(trafficSpeedFactor(40)).toBe(1);
  });
});

describe('HUSTLE traffic signals', () => {
  it('never grants both perpendicular approaches a green or yellow signal', () => {
    for (let t=-30;t<60;t+=.25) for (const x of [-120,-72,24,120]) {
      const a = signalAspect(t,x,24,'x'), b = signalAspect(t,x,24,'z');
      expect(a === 'red' || b === 'red').toBe(true);
    }
  });
  it('brakes before a red light and lets cars already in the intersection leave', () => {
    // At (24,24), the offset is 3 seconds.
    expect(signalAspect(10,24,24,'x')).toBe('red');
    expect(intersectionFactor(10,'x',24,12.85,1,4)).toBe(0);
    expect(intersectionFactor(10,'x',24,1,1,4)).toBeGreaterThan(0);
    expect(intersectionFactor(10,'x',24,20,1,4)).toBe(1);
    expect(intersectionFactor(0,'x',24,12.85,1,4)).toBe(1);
    expect(intersectionFactor(10,'x',168,12.85,1,4)).toBe(1);
  });
});
