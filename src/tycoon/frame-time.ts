/** One delta drives economy and visual-world clocks, so pausing a menu
 * cannot leave traffic, pedestrians and weather simulating behind it. */
export function animatedDelta(dt: number, playing: boolean, paused: boolean, hidden: boolean): number {
  if (!Number.isFinite(dt) || dt <= 0 || hidden || (playing && paused)) return 0;
  return Math.min(dt, 0.1);
}
