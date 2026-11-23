import type { Watcher } from './types';

export const PERFECT_COVER_POINTS = 90;

const MIN_EXPOSURE = 0.6;

/** Holds timing state for one patrol, independent of the classroom and dormitory UI. */
export class PerfectCoverTracker {
  private exposure = 0;
  private rewarded = false;

  advance(dt: number, exposed: boolean): void {
    this.exposure = exposed ? Math.min(MIN_EXPOSURE, this.exposure + dt) : 0;
  }

  clearExposure(): void {
    this.exposure = 0;
  }

  nextPatrol(): void {
    this.rewarded = false;
  }

  cover(watcher: Pick<Watcher, 'mode' | 'prog' | 't'>, hasActivity: boolean, forced: boolean): boolean {
    const timely = (watcher.mode === 'approach' && watcher.prog >= 0.55 && watcher.prog <= 0.9)
      || (watcher.mode === 'peek' && watcher.t <= 0.3);
    const success = !forced && hasActivity && this.exposure >= MIN_EXPOSURE && !this.rewarded && timely;
    this.clearExposure();
    if (success) this.rewarded = true;
    return success;
  }
}
