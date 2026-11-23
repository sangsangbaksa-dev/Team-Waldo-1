// HUSTLE — deterministic vehicle movement independent of Three.js and the economy.
export interface DriveState { x: number; z: number; heading: number; speed: number }
export interface DriveInput { throttle: number; steer: number; brake: boolean }
export interface DriveTuning { forward: number; reverse: number; turnRate: number; response: number }
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Uses short sweeps so large frame times cannot pass through walls. Returns true on impact. */
export function stepDrive(
  car: DriveState, input: DriveInput, delta: number, tuning: DriveTuning,
  canOccupy: (x: number, z: number, heading: number) => boolean,
): boolean {
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.1);
  if (!dt) return false;
  const throttle = clamp(input.throttle, -1, 1);
  const target = input.brake ? 0 : throttle > 0 ? throttle * tuning.forward : throttle * tuning.reverse;
  // Exponential easing does not depend on the browser's refresh rate.
  const response = input.brake ? 10 : throttle ? tuning.response : 2.4;
  car.speed += (target - car.speed) * (1 - Math.exp(-response * dt));
  if (Math.abs(car.speed) < 0.04) car.speed = 0;
  const turn = clamp(input.steer, -1, 1);
  const steeringFactor = Math.min(1, Math.abs(car.speed) / 4);
  const steerRate = tuning.turnRate * steeringFactor * (0.85 - 0.25 * Math.abs(car.speed) / tuning.forward);
  const nextHeading = car.heading + turn * Math.sign(car.speed) * steerRate * dt;
  // A tight turn cannot rotate a long car into geometry in a single frame.
  if (canOccupy(car.x, car.z, nextHeading)) car.heading = nextHeading;
  const count = Math.max(1, Math.ceil(Math.abs(car.speed) * dt / 0.42));
  for (let i = 0; i < count; i++) {
    const x = car.x + Math.cos(car.heading) * car.speed * dt / count;
    const z = car.z - Math.sin(car.heading) * car.speed * dt / count;
    if (!canOccupy(x, z, car.heading)) { car.speed = 0; return true; }
    car.x = x;
    car.z = z;
  }
  return false;
}
