import { describe, expect, it } from 'vitest';
import { stepDrive, type DriveInput, type DriveState, type DriveTuning } from '../../src/tycoon/scene/driving';

const tune: DriveTuning = { forward: 22, reverse: 7, turnRate: 1.8, response: 2.8 };
const fresh = (): DriveState => ({ x: 0, z: 0, heading: 0, speed: 0 });
const clear = (): boolean => true;
const run = (car: DriveState, input: DriveInput, frames = 60, occupy = clear): void => {
  for (let i = 0; i < frames; i++) stepDrive(car, input, 1 / 60, tune, occupy);
};

describe('HUSTLE car motion', () => {
  it('accelerates smoothly and respects the maximum forward speed', () => {
    const car = fresh(); run(car, { throttle: 1, steer: 0, brake: false }, 600);
    expect(car.speed).toBeGreaterThan(21.5);
    expect(car.speed).toBeLessThanOrEqual(tune.forward);
    expect(car.x).toBeGreaterThan(0);
  });
  it('supports a slower reversing speed', () => {
    const car = fresh(); run(car, { throttle: -1, steer: 0, brake: false }, 360);
    expect(car.x).toBeLessThan(0);
    expect(car.speed).toBeGreaterThanOrEqual(-tune.reverse);
  });
  it('does not turn on the spot, but turns while moving', () => {
    const car = fresh(); run(car, { throttle: 0, steer: 1, brake: false }, 120);
    expect(car.heading).toBe(0);
    run(car, { throttle: 1, steer: 1, brake: false }, 120);
    expect(car.heading).toBeGreaterThan(0);
    expect(car.z).toBeLessThan(0);
  });
  it('uses swept collision and cannot tunnel through a wall in a low-FPS frame', () => {
    const car = fresh(); car.speed = 22;
    const hit = stepDrive(car, { throttle: 1, steer: 0, brake: false }, .1, tune, x => x < 1);
    expect(hit).toBe(true);
    expect(car.x).toBeLessThan(1);
    expect(car.speed).toBe(0);
  });
  it('brakes without changing direction', () => {
    const car = fresh(); run(car, { throttle: 1, steer: 0, brake: false });
    const before = car.speed;
    run(car, { throttle: 1, steer: 0, brake: true }, 20);
    expect(car.speed).toBeLessThan(before * .3);
    expect(car.speed).toBeGreaterThanOrEqual(0);
  });
  it('ignores negative and nonfinite frame lengths', () => {
    const car = fresh();
    expect(stepDrive(car, { throttle: 1, steer: 0, brake: false }, NaN, tune, clear)).toBe(false);
    stepDrive(car, { throttle: 1, steer: 0, brake: false }, -4, tune, clear);
    expect(car).toEqual(fresh());
  });
});
