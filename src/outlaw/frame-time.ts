/** One simulation delta drives physics, environment effects and animations.
 * Menu overlays freeze the world; a live versus session remains active.
 * Slow-mo wheels and death sequences share their scale with the renderer. */
export function outlawWorldDelta(
  dt: number, paused: boolean, versusRunning: boolean, wheelOpen: boolean, wasted: boolean,
): number {
  if (!Number.isFinite(dt) || dt <= 0 || (paused && !versusRunning)) return 0;
  const scale = wheelOpen ? 0.2 : wasted ? 0.45 : 1;
  return Math.min(dt, 0.1) * scale;
}

/** Only mute spatial world ambience on an actual simulation pause; live
 * multiplayer menus may still leave gameplay running. */
export function worldAudioPaused(paused: boolean, versusRunning: boolean): boolean {
  return paused && !versusRunning;
}
