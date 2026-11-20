// Positive modulo for tiled visual effects. JS remainder can be negative.
export function wrapRange(value: number, span: number): number {
  return ((value % span) + span) % span;
}
export function wrapNear(value: number, center: number, radius: number): number {
  return center + wrapRange(value - center + radius, radius * 2) - radius;
}
