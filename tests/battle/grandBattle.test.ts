import { describe, expect, it } from 'vitest';
import { createWar, GRAND_INITIAL_FORCES, GRAND_MAX_UNITS, maxUnitsFor,
  GRAND_AI_ARMY_LIMITS, MAP_HALF_SIZE, stepWar, train, trainSquad, stormStartFor } from '../../src/battle/war';
import { decodeWar, encodeWar } from '../../src/battle/save';
import { assignSquad, commandSquad, squadUnits } from '../../src/battle/squads';

describe('600 soldier grand-battle expedition', () => {
  it('spawns 100 allied soldiers against exactly 500 enemy soldiers with mixed classes', () => {
    const war = createWar({ grandBattle: true, difficulty: 'easy' });
    expect(war.grandBattle).toBe(true);
    expect(war.units).toHaveLength(600);
    for (const [index, expected] of GRAND_INITIAL_FORCES.entries()) {
      expect(war.units.filter(unit => unit.owner === index)).toHaveLength(expected);
    }
    expect(war.units.filter(u => u.owner !== 0)).toHaveLength(500);
    expect(new Set(war.units.map(u => u.kind)).size).toBe(4);
    expect(maxUnitsFor(war)).toBe(GRAND_MAX_UNITS);
    expect(stormStartFor(war)).toBe(420);
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
    expect(restored!.units).toHaveLength(625);
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

  it.each(['easy', 'normal', 'hard'] as const)(
    'caps AI reinforcements on %s while preserving the opening 100 versus 500 battle',
    difficulty => {
      const war = createWar({ grandBattle: true, difficulty });
      expect(war.units.filter(u => u.owner !== 0)).toHaveLength(500);
      const ai = war.factions[1], cap = GRAND_AI_ARMY_LIMITS[difficulty];
      ai.gold = 1e7; ai.food = 1e7;
      ai.research = { weapons: 2, armor: 1, logistics: 1 };
      const deficit = cap - 4 - war.units.filter(u => u.owner === 1).length;
      for (let i = 0; i < Math.floor(deficit / 50); i++)
        expect(trainSquad(war, 1, 'infantry', 50)).toBe(true);
      if (deficit % 50) expect(trainSquad(war, 1, 'infantry', deficit % 50)).toBe(true);
      ai.aiTimer = 0;
      stepWar(war, .05);
      expect(war.units.filter(u => u.owner === 1)).toHaveLength(cap);
      ai.aiTimer = 0;
      stepWar(war, .05);
      expect(war.units.filter(u => u.owner === 1)).toHaveLength(cap);
    },
  );

  it('fires fort-scaled salvos at packed attackers without hitting everyone', () => {
    const war = createWar({ grandBattle: true });
    const home = war.factions[0];
    war.units = Array.from({ length: 6 }, (_, i) => ({
      id: 1000 + i, owner: 1, kind: 'infantry' as const,
      x: home.x + i * .2, z: home.z, hp: 52, cooldown: 10,
    }));
    for (const opponent of war.factions.slice(1)) opponent.aiTimer = 10000;
    stepWar(war, .05);
    expect(war.units.filter(u => u.hp < 52)).toHaveLength(5);
  });

  it('keeps edge-of-map formations in bounds so the battle still saves', () => {
    const war = createWar({ grandBattle: true });
    const flank = war.units.find(unit => unit.id === 95)!;
    war.units = [flank];
    flank.x = MAP_HALF_SIZE - 1.05;
    flank.z = MAP_HALF_SIZE - 10;
    for (const enemy of war.factions.slice(1)) enemy.aiTimer = 10000;
    expect(commandSquad(war, 0, { kind: 'move', x: MAP_HALF_SIZE - 5, z: MAP_HALF_SIZE - 5 })).toBe(true);
    for (let i = 0; i < 120; i++) stepWar(war, .1);
    expect(flank.x).toBeLessThanOrEqual(MAP_HALF_SIZE);
    expect(flank.z).toBeLessThanOrEqual(MAP_HALF_SIZE);
    expect(decodeWar(encodeWar(war))).not.toBeNull();
  });

  it('refuses unknown unit kinds without crashing or charging the player', () => {
    const war = createWar({ grandBattle: true });
    const before = [war.factions[0].gold, war.factions[0].food, war.units.length];
    expect(train(war, 0, 'missing' as never)).toBe(false);
    expect(trainSquad(war, 0, 'missing' as never, 25)).toBe(false);
    expect([war.factions[0].gold, war.factions[0].food, war.units.length]).toEqual(before);
  });
});
