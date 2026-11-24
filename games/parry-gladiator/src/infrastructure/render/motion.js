const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const TRAIL_INTERVAL = 1 / 90;
export const TRAIL_LIFETIME = 0.12;

export function trailOpacity(age, index, count) {
  return clamp(1 - age / TRAIL_LIFETIME, 0, 1) ** 1.4 * (0.25 + 0.75 * index / Math.max(1, count - 1));
}

export function impactAngle(dx, dz, spread, side) {
  return Math.atan2(dz, dx) + (side < 0.5 ? -1 : 1) * Math.PI / 2 + (spread - 0.5) * 1.4;
}

export function duelFraming(distance, aspect) {
  const narrow = clamp((1.25 - aspect) / 0.65, 0, 1);
  const close = clamp((3.2 - distance) / 1.9, 0, 1);
  return {
    depth: 5.15 + narrow * 0.7 + Math.min(2.1, distance * 0.19),
    shoulder: (1.55 - narrow * 0.65) + close * (0.85 - narrow * 0.25),
    height: 3.65 + Math.min(1.2, distance * 0.085) + close * 0.34,
  };
}

export function impactMotion(time, shake) {
  if (!(shake > 0)) return { x: 0, y: 0, z: 0 };
  return { x: Math.sin(time * 42) * shake, y: Math.cos(time * 51) * shake * 0.32, z: Math.cos(time * 39) * shake * 0.25 };
}
