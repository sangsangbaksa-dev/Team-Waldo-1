import { describe, expect, it } from 'vitest';
import { createWar, GRAND_INITIAL_FORCES, GRAND_MAX_UNITS, maxUnitsFor,
  MAX_UNITS, stepWar, trainSquad, stormStartFor } from '../../src/battle/war';
import { decodeWar, encodeWar } from '../../src/battle/save';
import { assignSquad, commandSquad, squadUnits } from '../../src/battle/squads';

describe('400 soldier grand-battle expedition', () => {
  it('spawns four equal armies of 100 soldiers with mixed classes', () => {
    const war = createWar({ grandBattle: true, difficulty: 'easy' });
    expect(war.grandBattle).toBe(true);
    expect(war.units).toHaveLength(400);
    for (const [index, expected] of GRAND_INITIAL_FORCES.entries()) {
      expect(war.units.filter(unit => unit.owner === index)).toHaveLength(expected);
    }
    expect(war.units.filter(u => u.owner !== 0)).toHaveLength(300);
    expect(new Set(war.units.map(u => u.kind)).size).toBe(4);
    expect(maxUnitsFor(war)).toBe(GRAND_MAX_UNITS);
    expect(stormStartFor(war)).toBe(360);
    expect(createWar().units).toHaveLength(16);
    expect(maxUnitsFor(createWar())).toBe(MAX_UNITS);
  });

  it('mobilizes 25 more troops and saves or resumes a high-population scenario', () => {
    const war = createWar({ grandBattle: true });
    expect(trainSquad(war, 0, 'infantry', 25)).toBe(true);
    expect(war.units.filter(unit => unit.owner === 0)).toHaveLength(125);
    expect(war.stats[0].trained).toBe(25);
    expect(assignSquad(war, 1, 25)).toBe(25);
    expect(commandSquad(war, 1, { kind: 'outpost', id: 5 })).toBe(true);
    const restored = decodeWar(encodeWar(war));
    expect(restored).not.toBeNull();
    expect(restored!.grandBattle).toBe(true);
    expect(squadUnits(restored!, 1)).toHaveLength(25);
    expect(restored!.squadOrders?.[1]).toEqual({kind:'outpost', id:5});
    expect(restored!.units).toHaveLength(425);
  });

  it('simulates 600 active units without numerical drift or invalid positions', () => {
    const a = createWar({ grandBattle: true });
    const b = createWar({ grandBattle: true });
    for (let i = 0; i < 30; i++) { stepWar(a, .025); stepWar(b, .025); }
    expect(a).toEqual(b);
    expect(a.time).toBeCloseTo(.75);
    expect(a.units.length).toBeGreaterThan(300);
    expect(a.units.every(u => Number.isFinite(u.x) && Number.isFinite(u.z) && u.hp > 0)).toBe(true);
  });

  it('rejects a grand army with corrupted coordinates or over-cap recruitment', () => {
    const war = createWar({ grandBattle: true });
    war.units[0].x = Infinity;
    expect(decodeWar(encodeWar(war))).toBeNull();
    const limited = createWar({ grandBattle: true });
    limited.factions[0].gold = 1e7;
    limited.factions[0].food = 1e7;
    for (let i = 0; i < 6; i++) expect(trainSquad(limited, 0, 'infantry', 50)).toBe(true);
    expect(limited.units.filter(u => u.owner === 0)).toHaveLength(400);
    expect(trainSquad(limited, 0, 'infantry', 1)).toBe(false);
  });
});
