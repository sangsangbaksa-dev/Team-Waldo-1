import { describe, expect, it } from 'vitest';
import { terrainY } from '../../src/sky/sim';

const islands = [
  { x: -700, z: -900, r: 520, h: 300 },
  { x: 1200, z: 300, r: 640, h: 380 },
  { x: -1500, z: 900, r: 420, h: 220 },
  { x: 300, z: 1700, r: 560, h: 330 },
  { x: 2000, z: -1500, r: 480, h: 260 },
  { x: -2100, z: -1700, r: 600, h: 350 },
  { x: 100, z: -200, r: 260, h: 120 },
];

// Legacy sqrt-based height formula; keep as a reference for equivalence
// after squared-distance optimization (graphics and collisions must match).
function legacyTerrain(x: number, z: number): number {
  let h = 0;
  for (const island of islands) {
    const d = Math.hypot(x - island.x, z - island.z) / island.r;
    if (d < 1) {
      const k = 1 - d * d;
      h = Math.max(h, island.h * k * k *
        (0.8 + 0.2 * Math.sin(x * 0.011) * Math.cos(z * 0.013)));
    }
  }
  return h;
}

describe('SKY WAR fast terrain height', () => {
  it('agrees with the original island shape across 1000 deterministic map positions', () => {
    for (let i = 0; i < 1000; i++) {
      const x = Math.sin(i * 83.17) * 3800;
      const z = Math.cos(i * 51.63) * 3800;
      expect(terrainY(x, z)).toBeCloseTo(legacyTerrain(x, z), 8);
    }
  });
  it('remains exact at island centers and coastal edges', () => {
    for (const island of islands) {
      for (const [dx, dz] of [
        [0, 0], [island.r, 0], [0, -island.r],
        [island.r * 0.999, 0], [-island.r * 0.6, island.r * 0.8],
      ]) {
        const x = island.x + dx, z = island.z + dz;
        expect(terrainY(x, z)).toBeCloseTo(legacyTerrain(x, z), 8);
      }
    }
  });
});
