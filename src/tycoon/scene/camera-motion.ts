/** Sample the entire sightline, including its final fractional interval. */
export function cameraClearance(distance: number, blocked: (distance: number) => boolean): number {
  const target = Math.max(0.35, distance);
  const steps = Math.max(1, Math.ceil(target / 0.35));
  for (let i = 1; i <= steps; i++) {
    const sample = target * i / steps;
    if (blocked(sample)) return Math.max(0.25, sample - 0.55);
  }
  return target;
}

/** Pull in immediately to avoid clipping; extend gradually when the view clears. */
export function easeCameraDistance(current: number, clearance: number, dt: number): number {
  if (clearance <= current) return clearance;
  return current + (clearance - current) * (1 - Math.exp(-Math.max(0, dt) * 4.5));
}
