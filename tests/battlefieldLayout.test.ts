import { describe, expect, it } from 'vitest';
import {
  BATTLEFIELD_FEATURES, battlefieldBlocksShot, battlefieldCoverAt, createBattlefieldLayout,
  isBattlefieldBlocked, resolveBattlefieldStep,
} from '../src/battle/battlefieldLayout';
import { createWar, stepWar } from '../src/battle/war';

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

  it('preserves unobstructed motion along clear roads', () => {
    const result = resolveBattlefieldStep(0, -7, 0, -6, 0, 0);
    expect(result).toEqual({ x: 0, z: -6 });
  });

  it('stops arrows that cross a solid footprint and lets a side lane through', () => {
    const cover = BATTLEFIELD_FEATURES.find(feature => {
      if (feature.radius < 2 || feature.radius > 6) return false;
      const gap = feature.radius + 1.25;
      const through = battlefieldBlocksShot(feature.x - gap, feature.z, feature.x + gap, feature.z);
      const openZ = feature.z + feature.radius + 4.5;
      const clear = !battlefieldBlocksShot(feature.x - gap, openZ, feature.x + gap, openZ);
      const walkable = [feature.z, openZ].every(z =>
        !isBattlefieldBlocked(feature.x - gap, z) && !isBattlefieldBlocked(feature.x + gap, z));
      return through && clear && walkable && gap * 2 < 15;
    });
    expect(cover).toBeDefined();
    if (!cover) return;
    const gap = cover.radius + 1.25;
    expect(battlefieldBlocksShot(0, -20, 0, 20)).toBe(false);
    expect(battlefieldBlocksShot(cover.x, cover.z, cover.x, cover.z)).toBe(false);

    const war = createWar();
    const archer = war.units.find(unit => unit.owner === 0)!;
    const target = war.units.find(unit => unit.owner === 1)!;
    archer.kind = 'archer';
    target.kind = 'archer';
    war.units = [archer, target];
    archer.x = cover.x - gap;
    archer.z = cover.z;
    target.x = cover.x + gap;
    target.z = cover.z;
    for (const faction of war.factions) {
      faction.aiTimer = 9999;
      faction.turretCooldown = 100;
    }
    const hidden = target.hp;
    stepWar(war, .05);
    expect(target.hp).toBe(hidden);
    expect(archer.cooldown).toBe(0);

    const openZ = cover.z + cover.radius + 4.5;
    archer.x = cover.x - gap;
    archer.z = openZ;
    target.x = cover.x + gap;
    target.z = openZ;
    stepWar(war, .05);
    expect(target.hp).toBeLessThan(hidden);
    expect(archer.cooldown).toBeGreaterThan(0);
  });
});
