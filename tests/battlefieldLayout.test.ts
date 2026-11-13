import { describe, expect, it } from 'vitest';
import {
  BATTLEFIELD_FEATURES, battlefieldCoverAt, createBattlefieldLayout,
  isBattlefieldBlocked, resolveBattlefieldStep,
} from '../src/battle/battlefieldLayout';

describe('industrial battlefield layout', () => {
  it('generates a diverse, reproducible battlefield without persisting new save data', () => {
    expect(createBattlefieldLayout()).toEqual(createBattlefieldLayout());
    expect(BATTLEFIELD_FEATURES.length).toBeGreaterThan(180);
    expect(new Set(BATTLEFIELD_FEATURES.map(feature => feature.kind)).size).toBeGreaterThan(12);
    expect(BATTLEFIELD_FEATURES.every(f =>
      Math.abs(f.x) <= 247 && Math.abs(f.z) <= 247 &&
      Number.isFinite(f.rotation) && f.radius >= 0 && f.cover >= 0 && f.cover <= 1,
    )).toBe(true);
    expect(createBattlefieldLayout(123)).not.toEqual(createBattlefieldLayout(456));
  });

  it('keeps the exact strategic center walkable for capturing the middle outpost', () => {
    expect(isBattlefieldBlocked(0, 0)).toBe(false);
    expect(isBattlefieldBlocked(0, -95)).toBe(false);
    expect(isBattlefieldBlocked(-112, -112)).toBe(false);
  });

  it('uses physical cover and routes around an occupied bunker or hangar footprint', () => {
    const structure = BATTLEFIELD_FEATURES.find(f => f.kind === 'hangar');
    expect(structure).toBeDefined();
    if (!structure) return;
    expect(isBattlefieldBlocked(structure.x, structure.z)).toBe(true);
    expect(battlefieldCoverAt(structure.x + structure.radius + 2, structure.z)).toBeGreaterThan(0);
    const startX = structure.x - structure.radius - 1.1;
    const startZ = structure.z;
    const attemptedX = startX + 2.5;
    const next = resolveBattlefieldStep(startX, startZ, attemptedX, startZ,
      structure.x + 20, startZ);
    expect(isBattlefieldBlocked(next.x, next.z)).toBe(false);
    expect(next.x === attemptedX && next.z === startZ).toBe(false);
  });

  it('lets an older saved position escape from inside a solid installation', () => {
    const structure = BATTLEFIELD_FEATURES.find(f => f.kind === 'hangar')!;
    let x = structure.x, z = structure.z;
    const goalX = x + 30, goalZ = z;
    for (let step = 0; step < 160; step++) {
      const distance = Math.hypot(goalX - x, goalZ - z);
      if (distance < 1) break;
      const next = resolveBattlefieldStep(x, z, x + (goalX - x) / distance * .84,
        z + (goalZ - z) / distance * .84, goalX, goalZ);
      x = next.x; z = next.z;
    }
    expect(isBattlefieldBlocked(x, z)).toBe(false);
    expect(Math.hypot(goalX - x, goalZ - z)).toBeLessThan(1);
  });

  it('preserves unobstructed motion along clear roads', () => {
    const result = resolveBattlefieldStep(0, -7, 0, -6, 0, 0);
    expect(result).toEqual({ x: 0, z: -6 });
  });
});
