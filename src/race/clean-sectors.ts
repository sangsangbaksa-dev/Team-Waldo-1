export interface CleanSectors {
  trackLength: number;
  limit: number;
  completed: number;
  clean: number;
  valid: boolean;
}

export function createCleanSectors(trackLength: number, laps: number): CleanSectors {
  return { trackLength, limit: laps * 3, completed: 0, clean: 0, valid: true };
}

export function invalidateCleanSector(state: CleanSectors): void {
  state.valid = false;
}

// Progress is cumulative track-sample distance, not wrapped lap position.
// Cross each boundary once, even after reversing; skipped sectors never earn a reward.
export function stepCleanSectors(state: CleanSectors, progress: number, collision: boolean): boolean {
  if (collision) invalidateCleanSector(state);
  if (!Number.isFinite(progress) || state.trackLength <= 0) return false;
  const reached = Math.min(state.limit, Math.floor(progress * 3 / state.trackLength));
  if (reached <= state.completed) return false;
  const earned = reached === state.completed + 1 && state.valid;
  state.completed = reached;
  if (earned) state.clean++;
  state.valid = true;
  return earned;
}
