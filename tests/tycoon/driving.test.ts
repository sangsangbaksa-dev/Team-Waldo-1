import { describe, expect, it } from 'vitest';
import { carBodiesOverlap, pointWithinCar, pushWalkerFromCar, stepDrive, type DriveInput, type DriveState, type DriveTuning } from '../../src/tycoon/scene/driving';

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
  it('keeps heading within [-pi, pi] after repeated loops', () => {
    const car = fresh();
    run(car, { throttle: 1, steer: 1, brake: false }, 2400);
    expect(Math.abs(car.heading)).toBeLessThanOrEqual(Math.PI);
    expect(Number.isFinite(car.x)).toBe(true);
    expect(Number.isFinite(car.z)).toBe(true);
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


describe('HUSTLE allocation-free point occupancy', () => {
  it('matches the existing parking separation logic across orientations', () => {
    const car = { x: 5, z: -3, heading: Math.PI / 3 };
    for (let ix = -8; ix <= 8; ix++) for (let iz = -8; iz <= 8; iz++) {
      const x = car.x + ix * 0.4, z = car.z + iz * 0.4, r = 0.45;
      const q = pushWalkerFromCar(x, z, r, car);
      const pushed = Math.hypot(q.x - x, q.z - z) > 1e-6;
      expect(pointWithinCar(x, z, r, car)).toBe(pushed);
    }
    expect(pointWithinCar(100, 100, 0.45, car)).toBe(false);
  });
});

describe('HUSTLE parking collision', () => {
  const parked = { x: 0, z: 0, heading: 0 };
  it('pushes a walker outside a parked body', () => {
    const point = pushWalkerFromCar(0, 0, 0.45, parked);
    expect(Math.hypot(point.x, point.z)).toBeGreaterThan(1.4);
  });
  it('leaves distant walkers untouched', () => {
    expect(pushWalkerFromCar(8, 8, 0.45, parked)).toEqual({ x: 8, z: 8 });
  });
  it('uses the rotated footprint when parking on north-south streets', () => {
    const car = { x: 5, z: 6, heading: -Math.PI / 2 };
    const point = pushWalkerFromCar(5, 6, 0.45, car);
    expect(Math.hypot(point.x - 5, point.z - 6)).toBeGreaterThan(1.4);
  });
});


describe('HUSTLE exact vehicle collision', () => {
  it('detects shallow overlaps between two diagonally parked vehicles', () => {
    const a = { x: 0, z: 0, heading: 0.9057469858718303 };
    const b = { x: -1.727969384752214, z: -1.4073390047997236, heading: 0.9821935036618596 };
    expect(carBodiesOverlap(a, b)).toBe(true);
    expect(carBodiesOverlap(a, { x: 100, z: 100, heading: 0 })).toBe(false);
  });
  it('is symmetric and respects car orientation', () => {
    const a = { x: 0, z: 0, heading: 0 };
    const b = { x: 3.9, z: 0, heading: 0 };
    expect(carBodiesOverlap(a, b)).toBe(true);
    expect(carBodiesOverlap(b, a)).toBe(true);
    expect(carBodiesOverlap(a, { x: 0, z: 6, heading: 0 })).toBe(false);
  });
});
