// HUSTLE — deterministic vehicle movement independent of Three.js and the economy.
export interface DriveState { x: number; z: number; heading: number; speed: number }
export interface DriveInput { throttle: number; steer: number; brake: boolean }
export interface DriveTuning { forward: number; reverse: number; turnRate: number; response: number }
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
export const DRIVE_STEP = 1 / 60;
const MAX_DRIVE_STEPS = 6;

/** Fixed slices so a long frame cannot take a different path from several short ones. */
export function planDriveSteps(delta: number, leftover = 0): { steps: number; leftover: number } {
  const dt = clamp(Number.isFinite(delta) ? delta : 0, 0, 0.1);
  let acc = Number.isFinite(leftover) && leftover > 0 ? leftover + dt : dt;
  let steps = 0;
  while (acc >= DRIVE_STEP && steps < MAX_DRIVE_STEPS) {
    acc -= DRIVE_STEP;
    steps++;
  }
  if (steps === MAX_DRIVE_STEPS) acc = 0;
  return { steps, leftover: acc };
}

/** Keyboard and the stick share one axis. Brake drops throttle so the two cannot fight. */
export function driveCommand(
  keys: { left: boolean; right: boolean; forward: boolean; back: boolean; brake: boolean },
  stickX: number, stickY: number,
): DriveInput {
  const steer = clamp((keys.left ? 1 : 0) - (keys.right ? 1 : 0) - stickX, -1, 1);
  const raw = clamp((keys.forward ? 1 : 0) - (keys.back ? 1 : 0) - stickY, -1, 1);
  return { steer, throttle: keys.brake ? 0 : raw, brake: keys.brake };
}

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
  if (canOccupy(car.x, car.z, nextHeading)) car.heading = Math.atan2(Math.sin(nextHeading), Math.cos(nextHeading));
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

/** Fast, allocation-free overlap probe for pedestrians and moving NPC traffic. */
export function pointWithinCar(
  x: number, z: number, radius: number,
  car: { x: number; z: number; heading: number },
  halfLength = 2.35, halfWidth = 1.05,
): boolean {
  const dx = x - car.x, dz = z - car.z;
  const cs = Math.cos(car.heading), sn = Math.sin(car.heading);
  return Math.abs(dx * cs - dz * sn) < halfLength + radius &&
    Math.abs(dx * sn + dz * cs) < halfWidth + radius;
}

/** Resolve a walking circle against a parked car in the car's local axes. */
export function pushWalkerFromCar(
  x: number, z: number, r: number, car: { x: number; z: number; heading: number },
  halfLength = 2.35, halfWidth = 1.05,
): { x: number; z: number } {
  const cs = Math.cos(car.heading), sn = Math.sin(car.heading);
  const dx = x - car.x, dz = z - car.z;
  let forward = dx * cs - dz * sn;
  let sideways = dx * sn + dz * cs;
  const left = halfLength + r - Math.abs(forward);
  const side = halfWidth + r - Math.abs(sideways);
  if (left <= 0 || side <= 0) return { x, z };
  if (left < side) forward += (forward >= 0 ? 1 : -1) * left;
  else sideways += (sideways >= 0 ? 1 : -1) * side;
  return {
    x: car.x + forward * cs + sideways * sn,
    z: car.z - forward * sn + sideways * cs,
  };
}

/** Separating-axis test for two rotated car body footprints. */
export function carBodiesOverlap(
  a: { x: number; z: number; heading: number },
  b: { x: number; z: number; heading: number },
  halfLength = 2.35, halfWidth = 1.05,
): boolean {
  // Equivalent to testing four separating axes; no per-frame object allocations.
  const ca = Math.cos(a.heading), sa = Math.sin(a.heading);
  const cb = Math.cos(b.heading), sb = Math.sin(b.heading);
  const cos = Math.abs(Math.cos(a.heading - b.heading));
  const sin = Math.abs(Math.sin(a.heading - b.heading));
  const dx = b.x - a.x, dz = b.z - a.z;
  const forwardRadius = halfLength + halfLength * cos + halfWidth * sin;
  const sideRadius = halfWidth + halfLength * sin + halfWidth * cos;
  return Math.abs(dx * ca - dz * sa) <= forwardRadius &&
    Math.abs(dx * sa + dz * ca) <= sideRadius &&
    Math.abs(dx * cb - dz * sb) <= forwardRadius &&
    Math.abs(dx * sb + dz * cb) <= sideRadius;
}
