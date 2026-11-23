import { describe, expect, it } from 'vitest';
import { startBannerPose } from '../../src/race/track-queries';

describe('SPEED RUSH starting gantry banner placement', () => {
  it('faces approaching vehicles rather than pointing along the track', () => {
    for (const theta of [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 2, -2.5]) {
      const tx = Math.cos(theta), tz = Math.sin(theta), pose = startBannerPose(tx, tz);
      // A Three.js plane faces (sin(yaw), 0, cos(yaw)).
      expect(Math.sin(pose.yaw)).toBeCloseTo(-tx, 9);
      expect(Math.cos(pose.yaw)).toBeCloseTo(-tz, 9);
    }
  });

  it('offsets the sign far enough from the beam to avoid z-fighting', () => {
    const halfDepth = 0.9 / 2;
    for (const theta of [0, 0.7, 1.4, -1.1, 2.8]) {
      const tx = Math.cos(theta), tz = Math.sin(theta);
      const pose = startBannerPose(tx, tz);
      const towardsDrivers = pose.dx * -tx + pose.dz * -tz;
      expect(towardsDrivers).toBeCloseTo(0.65, 9);
      expect(towardsDrivers).toBeGreaterThan(halfDepth + 0.1);
    }
  });
});
