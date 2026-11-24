/** One stalled frame must not skip the moment the player can cover the screen. */
export const MAX_PLAY_STEP = 0.25;

export function frameDelta(now: number, last: number, max = MAX_PLAY_STEP): number {
  if (!Number.isFinite(now) || !Number.isFinite(last)) return 0;
  const dt = (now - last) / 1000;
  if (!(dt > 0)) return 0;
  return Math.min(max, dt);
}
