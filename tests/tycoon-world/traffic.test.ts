import { describe, expect, it } from 'vitest';
import { trafficSpeedFactor, pedestrianSpeedFactor, crossingTrafficFactor } from '../../src/tycoon/scene/people';
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

it('uses the existing road-center geometry for each signal cycle', () => {
  for (const t of [-48, 0, 4, 9, 16, 25, 100]) {
    expect(['green','yellow','red']).toContain(signalAspect(t,24,24,'x'));
    const stop = intersectionFactor(t,'x',24,0,1,4);
    expect(stop).toBeGreaterThanOrEqual(0); expect(stop).toBeLessThanOrEqual(1);
  }
});

describe('HUSTLE pedestrian-aware car safety', () => {
  it('brakes for people crossing in front of the vehicle', () => {
    expect(pedestrianSpeedFactor(0, 0, 'x', 1, 4.4, 5, 0)).toBe(0);
    expect(pedestrianSpeedFactor(0, 0, 'x', 1, 4.4, 10, 0)).toBeLessThan(1);
    expect(pedestrianSpeedFactor(0, 0, 'z', -1, 5, 0, -5)).toBe(0);
  });
  it('does not brake for a pedestrian behind the car or safely on the sidewalk', () => {
    expect(pedestrianSpeedFactor(0, 0, 'x', 1, 4.4, -5, 0)).toBe(1);
    expect(pedestrianSpeedFactor(0, 0, 'x', 1, 4.4, 5, 5)).toBe(1);
    expect(pedestrianSpeedFactor(0, 0, 'z', 1, 5, 5, 5)).toBe(1);
    expect(pedestrianSpeedFactor(0, 0, 'x', -1, 4.4, -50, 0)).toBe(1);
  });
});

// Regression: the pedestrian may already be inside the body when the frame runs.
describe('HUSTLE traffic overlap clearance', () => {
  it('halts for pedestrians inside the car footprint on both axes', () => {
    expect(pedestrianSpeedFactor(0, 0, 'x', 1, 4.4, 0, 0)).toBe(0);
    expect(pedestrianSpeedFactor(0, 0, 'x', 1, 4.4, -1.8, 0)).toBe(0);
    expect(pedestrianSpeedFactor(0, 0, 'z', -1, 5, 0, 1.8)).toBe(0);
  });
  it('ignores people safely behind the rear bumper', () => {
    expect(pedestrianSpeedFactor(0, 0, 'x', 1, 4.4, -3.6, 0)).toBe(1);
    expect(pedestrianSpeedFactor(0, 0, 'z', -1, 5, 0, 4)).toBe(1);
  });
});

describe('HUSTLE perpendicular intersection occupancy', () => {
  it('brakes before a crosswalk when a cross-direction bus has not cleared the intersection', () => {
    // Eastbound sedan at x=7.5 on z=24, bus crossing northbound on x=24.
    const factor = crossingTrafficFactor('x', 24, 7.5, 1, 4.4, 24, 24, 9.5);
    expect(factor).toBe(0);
    expect(crossingTrafficFactor('x', 24, 3, 1, 4.4, 24, 24, 9.5)).toBeGreaterThan(0);
    // The perpendicular bus has already left the crossing.
    expect(crossingTrafficFactor('x', 24, 7.5, 1, 4.4, 24, 48, 9.5)).toBe(1);
  });
  it('supports negative-direction turns and never stops a vehicle already inside the crossing', () => {
    expect(crossingTrafficFactor('z', -24, 7.5, -1, 5, -24, -24, 4.4)).toBe(1);
    expect(crossingTrafficFactor('z', -24, -7.5, -1, 5, -24, -24, 4.4)).toBe(0);
    expect(crossingTrafficFactor('z', -24, -24, -1, 5, -24, -24, 4.4)).toBe(1);
    expect(crossingTrafficFactor('x', 24, 24, 1, 4.4, 24, 24, 9.5)).toBe(1);
  });
});
