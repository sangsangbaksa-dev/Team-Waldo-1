// Convert camera-relative input into the arena plane without browser dependencies.
export function relativeDirection(input, me, rival) {
  const dx = rival.x - me.x, dz = rival.z - me.z;
  const distance = Math.hypot(dx, dz) || 1;
  return { x: (dx * input.z - dz * input.x) / distance, z: (dz * input.z + dx * input.x) / distance };
}
