import type { VehicleBody } from '../vehicles/domain.js';

export interface VehiclePose { x: number; z: number; yaw: number }
type Blocked = (x: number, z: number) => boolean;
/** Test the center and four corners, not a fictitious wall centered on the car. */
export function vehicleBlocked(pose: VehiclePose, length: number, width: number, blocked: Blocked): boolean {
  if (blocked(pose.x, pose.z)) return true;
  const fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw);
  const rx = fz, rz = -fx;
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    if (blocked(pose.x + a * fx * length * .42 + b * rx * width * .38,
      pose.z + a * fz * length * .42 + b * rz * width * .38)) return true;
  }
  return false;
}
/** Recover toward the last valid pose, allowing movement out of a preexisting overlap. */
export function resolveVehicleWall(body: VehicleBody, previous: VehiclePose, blocked: Blocked): boolean {
  const check = (p: VehiclePose) => vehicleBlocked(p, body.spec.length, body.spec.width, blocked);
  if (!check(body)) return false;
  if (check(previous) && !blocked(body.x, body.z)) return false;
  const speed = Math.hypot(body.vx, body.vz);
  const next = { x: body.x, z: body.z, yaw: body.yaw };
  const xOnly = { x: next.x, z: previous.z, yaw: previous.yaw };
  const zOnly = { x: previous.x, z: next.z, yaw: previous.yaw };
  if (!check(xOnly)) { body.x = xOnly.x; body.z = xOnly.z; body.vz *= -.18; body.vx *= .65; }
  else if (!check(zOnly)) { body.x = zOnly.x; body.z = zOnly.z; body.vx *= -.18; body.vz *= .65; }
  else { body.x = previous.x; body.z = previous.z; body.vx *= -.18; body.vz *= -.18; }
  body.yaw = previous.yaw;
  if (speed > 2) { body.health = Math.max(0, body.health - (speed - 2) * 1.65); body.impact = Math.min(1, speed / 12); }
  return true;
}
