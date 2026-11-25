import { describe, expect, it } from 'vitest';
import { watcherPose } from '../../src/slack/watcher-visual';
import type { WatchMode } from '../../src/slack/types';

describe('watcher presentation', () => {
  it('keeps the door closed and supervisor outside before scan', () => {
    for (const phase of ['away', 'approach', 'peek'] as const) {
      expect(watcherPose(phase, 0.8, 1)).toEqual({ door: 0, presence: 0, distance: 0, gait: 0 });
    }
  });
  it('opens gradually and holds the door through the patrol', () => {
    expect(watcherPose('scan', 0, 0).door).toBe(0);
    const mid = watcherPose('scan', 0.08, 0.2).door;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(watcherPose('scan', 0.5, 1).door).toBe(1);
    expect(watcherPose('scan', 1, 0).presence).toBe(1);
  });
  it('closes smoothly after the patrol without a discontinuous door angle', () => {
    expect(watcherPose('scan', 1, 0).door).toBe(watcherPose('leave', 0, 0).door);
    expect(watcherPose('leave', 0.35, 0).door).toBeCloseTo(0.5);
    expect(watcherPose('leave', 1, 0)).toEqual(watcherPose('away', 0, 0));
  });
  it('bounds pose values for invalid or extreme progress', () => {
    for (const mode of ['away', 'approach', 'peek', 'scan', 'leave'] as WatchMode[]) {
      for (const t of [-10, 0, 0.1, 0.5, 1, 10, NaN]) {
        const pose = watcherPose(mode, t, Infinity);
        for (const value of [pose.door, pose.presence, pose.distance]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        expect(Math.abs(pose.gait)).toBeLessThanOrEqual(1);
      }
    }
  });
});
