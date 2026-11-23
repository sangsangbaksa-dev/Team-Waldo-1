/** Signed cosine of the direction from an entity toward the observer. */
export function facingDot(yaw, source, target) {
  if (!Number.isFinite(yaw) ||
      ![source?.x, source?.z, target?.x, target?.z].every(Number.isFinite)) return -1;
  const dx = target.x - source.x, dz = target.z - source.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return 1;
  return (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / distance;
}

/** The monster notices someone behind it only within immediate reach. */
export function canSeeTarget(distance, unobstructed, lightOn, facing) {
  const range = lightOn ? 10.7 : 6.1;
  return Boolean(unobstructed) && Number.isFinite(distance) && distance >= 0 &&
    distance <= range && (distance <= 2.4 || facing >= -0.12);
}
