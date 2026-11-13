import { describe, expect, it } from 'vitest';
import { UnitSpatialIndex } from '../../src/battle/unitSpatialIndex';
import { createWar, type Unit, type War } from '../../src/battle/war';

function bruteForce(w: War, unit: Unit, radius: number): Unit | undefined {
  let nearest: Unit | undefined, nearestSq = radius * radius;
  for (const candidate of w.units) {
    const faction = w.factions[candidate.owner];
    if (candidate.owner === unit.owner || candidate.hp <= 0 || !faction.alive || faction.hp <= 0) continue;
    const d2 = (unit.x-candidate.x)**2 + (unit.z-candidate.z)**2;
    if (d2 < nearestSq) { nearestSq = d2; nearest = candidate; }
  }
  return nearest;
}

describe('strategy unit spatial index', () => {
  it('matches a full scan across map edges, negative coordinates and multiple query radii', () => {
    const war = createWar({ grandBattle: true });
    let seed = 1234;
    const coordinate = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296 * 520 - 260;
    };
    for (const unit of war.units) { unit.x = coordinate(); unit.z = coordinate(); }
    const index = new UnitSpatialIndex();
    index.rebuild(war);
    for (const radius of [12, 18, 45]) {
      for (const unit of war.units) expect(index.nearestEnemy(war, unit, radius)?.id)
        .toBe(bruteForce(war, unit, radius)?.id);
    }
  });

  it('reuses buckets without retaining removed troops or missing reinforcements', () => {
    const war = createWar(), index = new UnitSpatialIndex();
    const unit = war.units[0], enemy = war.units.find(u => u.owner === 1)!;
    unit.x = -18; unit.z = 0; enemy.x = -17; enemy.z = 0;
    index.rebuild(war);
    expect(index.nearestEnemy(war, unit, 12)).toBe(enemy);
    war.units = [unit];
    index.rebuild(war);
    expect(index.nearestEnemy(war, unit, 12)).toBeUndefined();
    const recruit = { ...enemy, id: war.nextUnit++, x: -19 };
    war.units.push(recruit);
    index.rebuild(war);
    expect(index.nearestEnemy(war, unit, 12)).toBe(recruit);
  });

  it('checks deaths and collapsed HQs that occur after rebuilding', () => {
    const war = createWar(), index = new UnitSpatialIndex();
    const unit = war.units[0], enemy = war.units.find(u => u.owner === 1)!;
    unit.x = enemy.x; unit.z = enemy.z;
    index.rebuild(war);
    expect(index.nearestEnemy(war, unit, 12)).toBeDefined();
    for (const candidate of war.units) if (candidate.owner === 1) candidate.hp = 0;
    expect(index.nearestEnemy(war, unit, 12)).toBeUndefined();
    enemy.hp = 52;
    war.factions[1].hp = 0;
    expect(index.nearestEnemy(war, unit, 12)).toBeUndefined();
    war.factions[1].hp = 400; war.factions[1].alive = false;
    expect(index.nearestEnemy(war, unit, 12)).toBeUndefined();
  });

  it('preserves insertion order for equally close opponents in the same cell', () => {
    const war = createWar(), index = new UnitSpatialIndex();
    const unit = { ...war.units[0], x: 5, z: 5 };
    const first = { ...war.units[4], x: 4, z: 5 };
    const second = { ...war.units[5], x: 6, z: 5 };
    war.units = [unit, first, second];
    index.rebuild(war);
    expect(index.nearestEnemy(war, unit, 12)).toBe(first);
    first.hp = 0;
    expect(index.nearestEnemy(war, unit, 12)).toBe(second);
  });
});
