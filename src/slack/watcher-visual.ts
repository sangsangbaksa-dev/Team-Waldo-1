import type { WatchMode } from './types';

const clamp01 = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const smooth = (value: number): number => { const t = clamp01(value); return t * t * (3 - 2 * t); };

export interface WatcherPose {
  door: number;
  presence: number;
  distance: number;
  gait: number;
}

// Read-only mapping from existing patrol phases to a continuous visual pose.
export function watcherPose(mode: WatchMode, progress: number, near: number): WatcherPose {
  const t = clamp01(progress);
  if (mode === 'scan') {
    return {
      door: smooth(t / 0.16),
      presence: smooth(t / 0.12),
      distance: clamp01(near),
      gait: Math.sin(t * Math.PI * 10) * Math.abs(Math.cos(t * Math.PI)),
    };
  }
  if (mode === 'leave') {
    return { door: 1 - smooth(t / 0.7), presence: 1 - smooth(t / 0.42), distance: 0, gait: -Math.sin(t * Math.PI * 4) * (1 - t) };
  }
  return { door: 0, presence: 0, distance: 0, gait: 0 };
}
