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
  const ca = Math.cos(a.heading), sa = Math.sin(a.heading);
  const cb = Math.cos(b.heading), sb = Math.sin(b.heading);
  const au = { x: ca, z: -sa }, av = { x: sa, z: ca };
  const bu = { x: cb, z: -sb }, bv = { x: sb, z: cb };
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const axis of [au, av, bu, bv]) {
    const dot = (x: { x: number; z: number }): number => x.x * axis.x + x.z * axis.z;
    const ra = halfLength * Math.abs(dot(au)) + halfWidth * Math.abs(dot(av));
    const rb = halfLength * Math.abs(dot(bu)) + halfWidth * Math.abs(dot(bv));
    if (Math.abs(dx * axis.x + dz * axis.z) > ra + rb) return false;
  }
  return true;
}
