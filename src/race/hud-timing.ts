// Wrong-way warnings use simulated seconds, not display frames.
export const WRONG_WAY_DELAY = 0.35;
export function advanceWrongWay(previous: number, racing: boolean, directionSpeed: number, dt: number): number {
  if (!racing || !Number.isFinite(directionSpeed) || directionSpeed >= -6) return 0;
  const elapsed = Number.isFinite(previous) ? Math.max(0, previous) : 0;
  return Math.min(WRONG_WAY_DELAY, elapsed + (Number.isFinite(dt) ? Math.max(0, dt) : 0));
}
