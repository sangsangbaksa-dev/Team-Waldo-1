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
      Math.abs(f.x) <= 507 && Math.abs(f.z) <= 507 &&
      Number.isFinite(f.rotation) && f.radius >= 0 && f.cover >= 0 && f.cover <= 1,
    )).toBe(true);
    expect(createBattlefieldLayout(123)).not.toEqual(createBattlefieldLayout(456));
  });

  it('keeps the exact strategic center walkable for capturing the middle outpost', () => {
    expect(isBattlefieldBlocked(0, 0)).toBe(false);
    expect(isBattlefieldBlocked(0, -230)).toBe(false);
    expect(isBattlefieldBlocked(-260, -260)).toBe(false);
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

  it('preserves unobstructed motion along clear roads', () => {
    const result = resolveBattlefieldStep(0, -7, 0, -6, 0, 0);
    expect(result).toEqual({ x: 0, z: -6 });
  });
});
