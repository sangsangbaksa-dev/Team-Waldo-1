import { describe, expect, it } from 'vitest';
import { createWar, getIncome, MAP_HALF_SIZE, stepWar, stormStartFor } from '../../src/battle/war';
import { assignSquad, commandSquad, dismissSquad, squadDestination, squadUnits, SQUAD_NAMES } from '../../src/battle/squads';
import { encodeWar, decodeWar } from '../../src/battle/save';

describe('independent army groups', () => {
  it('separates recruits into 3 selectable squads without duplication', () => {
    const war = createWar();
    expect(SQUAD_NAMES).toHaveLength(3);
    expect(assignSquad(war, 1, 3)).toBe(3);
    expect(assignSquad(war, 2, 3)).toBe(1);
    expect(squadUnits(war, 0)).toHaveLength(0);
    expect(squadUnits(war, 1)).toHaveLength(3);
    expect(squadUnits(war, 2)).toHaveLength(1);
    expect(war.units.filter(unit => unit.owner === 0)).toHaveLength(4);
  });

  it('moves a selected group independently, leaving the other group near its original location', () => {
    const war = createWar();
    war.units = war.units.filter(unit => unit.owner === 0);
    war.factions.slice(1).forEach(faction => { faction.aiTimer = 9999; });
    expect(assignSquad(war, 1, 2)).toBe(2);
    const main = squadUnits(war, 0).map(unit => ({ id: unit.id, x: unit.x, z: unit.z }));
    expect(commandSquad(war, 1, { kind: 'move', x: -62, z: -62 })).toBe(true);
    for (let i = 0; i < 480; i++) stepWar(war, .1);
    for (const unit of squadUnits(war, 1)) {
      expect(Math.hypot(unit.x + 62, unit.z + 62)).toBeLessThan(10);
    }
    for (const original of main) {
      const current = war.units.find(unit => unit.id === original.id)!;
      expect(Math.hypot(current.x - original.x, current.z - original.z)).toBeLessThan(15);
    }
    expect(commandSquad(war, 1, { kind: 'home' })).toBe(true);
    expect(squadDestination(war, 1)).toEqual({ x: -260, z: -260 });
  });

  it('validates map orders and persists independent squad destinations', () => {
    const war = createWar();
    assignSquad(war, 1, 2);
    expect(commandSquad(war, 1, { kind: 'move', x: MAP_HALF_SIZE + 10, z: 0 })).toBe(false);
    expect(commandSquad(war, 1, { kind: 'faction', id: 0 })).toBe(false);
    expect(commandSquad(war, 1, { kind: 'outpost', id: 999 })).toBe(false);
    expect(commandSquad(war, 1, { kind: 'move', x: 100, z: -35 })).toBe(true);
    const resumed = decodeWar(encodeWar(war));
    expect(resumed).not.toBeNull();
    expect(squadUnits(resumed!, 1)).toHaveLength(2);
    expect(squadDestination(resumed!, 1)).toEqual({ x: 100, z: -35 });
    expect(dismissSquad(war, 1)).toBe(2);
    expect(squadDestination(war, 1)).toBeNull();
    expect(squadUnits(war, 0)).toHaveLength(4);
  });

  it('keeps old saved matches readable without requiring new squad fields', () => {
    const war = createWar();
    for (const unit of war.units) delete unit.squad;
    delete war.squadOrders;
    const restored = decodeWar(encodeWar(war));
    expect(restored).not.toBeNull();
    expect(squadUnits(restored!, 0)).toHaveLength(4);
    expect(assignSquad(restored!, 1, 2)).toBe(2);
  });
});

describe('accessible entry difficulty', () => {
  it('preserves normal challenge while giving easy extra time, income and less enemy AI budget', () => {
    const easy = createWar({ difficulty: 'easy' });
    const regular = createWar({ difficulty: 'normal' });
    expect(stormStartFor(easy)).toBeGreaterThan(stormStartFor(regular));
    expect(getIncome(easy, 0).gold).toBeGreaterThan(getIncome(regular, 0).gold);
    expect(getIncome(easy, 1).gold).toBeLessThan(getIncome(regular, 1).gold);
  });
});
