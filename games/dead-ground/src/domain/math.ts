export interface Vec3 { x: number; y: number; z: number }

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const horizontalDistance = (a: Pick<Vec3, 'x' | 'z'>, b: Pick<Vec3, 'x' | 'z'>) => Math.hypot(a.x - b.x, a.z - b.z);
export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const direction = (yaw: number, pitch: number): Vec3 =>
  vec(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

export function angleDelta(from: number, to: number): number {
  const delta = to - from;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

export function randomSource(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** First point of intersection on the finite segment, expressed as a fraction. */
export function segmentBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): number {
  let enter = 0;
  let leave = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-8) {
      if (a[axis] < min[axis] || a[axis] > max[axis]) return Infinity;
      continue;
    }
    const near = (min[axis] - a[axis]) / delta;
    const far = (max[axis] - a[axis]) / delta;
    enter = Math.max(enter, Math.min(near, far));
    leave = Math.min(leave, Math.max(near, far));
    if (enter > leave) return Infinity;
  }
  return enter;
}

export function segmentSphere(a: Vec3, b: Vec3, center: Vec3, radius: number): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const x = a.x - center.x, y = a.y - center.y, z = a.z - center.z;
  const offset = x * x + y * y + z * z - radius * radius;
  if (offset <= 0) return 0;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const projection = x * dx + y * dy + z * dz;
  const determinant = projection * projection - lengthSquared * offset;
  if (determinant < 0 || lengthSquared === 0) return Infinity;
  const t = (-projection - Math.sqrt(determinant)) / lengthSquared;
  return t >= 0 && t <= 1 ? t : Infinity;
}
