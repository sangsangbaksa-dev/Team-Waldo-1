/** Presentation clock. The simulation accepts the dt it is given; the frame loop clamps hitches. */
export function frameDelta(now: number, last: number, max = 0.05): number {
  if (!Number.isFinite(now) || !Number.isFinite(last)) return 0;
  const dt = (now - last) / 1000;
  if (!(dt > 0)) return 0;
  return Math.min(max, dt);
}
