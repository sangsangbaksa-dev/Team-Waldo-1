/** Collision between a circular player footprint and a rotated prop. */
export function circleHitsProp(x, z, radius, obstacle) {
  if (![x, z, radius, obstacle?.x, obstacle?.z, obstacle?.rotation,
        obstacle?.halfWidth, obstacle?.halfDepth].every(Number.isFinite) ||
      radius < 0 || obstacle.halfWidth < 0 || obstacle.halfDepth < 0) return false;
  const dx = x - obstacle.x, dz = z - obstacle.z;
  const cos = Math.cos(obstacle.rotation), sin = Math.sin(obstacle.rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const offX = Math.max(0, Math.abs(localX) - obstacle.halfWidth);
  const offZ = Math.max(0, Math.abs(localZ) - obstacle.halfDepth);
  return offX * offX + offZ * offZ < radius * radius;
}

/** Allows a previously overlapping player to escape but never sink deeper. */
export function propClearance(x, z, oldX, oldZ, radius, obstacles) {
  for (const o of obstacles) {
    if (o.root?.visible === false || o.visible === false) continue;
    if (!circleHitsProp(x, z, radius, o)) continue;
    const wasInside = circleHitsProp(oldX, oldZ, radius, o);
    const newDistance = Math.hypot(x - o.x, z - o.z);
    const oldDistance = Math.hypot(oldX - o.x, oldZ - o.z);
    if (!wasInside || newDistance <= oldDistance) return false;
  }
  return true;
}
