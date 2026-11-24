import { BR_PLAYERS } from '../config';
import type { Match } from '../sim';

export function roomFillOf(config: Record<string, unknown>, humans: number): number {
  const fill = config.fill;
  return typeof fill === 'number' && Number.isFinite(fill) && fill > 0
    ? Math.max(humans, Math.min(BR_PLAYERS, Math.floor(fill))) : 0;
}

/** Preserve partial final steps and call synchronization before each simulation step. */
export function advanceMatch(match: Pick<Match, 'step'>, dt: number, beforeStep: (dt: number) => void): void {
  let left = dt;
  while (left > 1e-6) {
    const step = Math.min(1 / 60, left);
    left -= step;
    beforeStep(step);
    match.step(step);
  }
}

/** Resolve an unobserved match without rendering or playing its events. */
export function fastForward(match: Pick<Match, 'step' | 'drain' | 'over' | 'winner'>, maxSeconds = 600): number | null {
  for (let t = 0; t < maxSeconds && !match.over; t += 1 / 30) {
    match.step(1 / 30);
    match.drain();
  }
  return match.over ? match.winner : null;
}
