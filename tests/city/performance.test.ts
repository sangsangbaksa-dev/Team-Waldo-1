import { describe, expect, it } from 'vitest';
import { CIV } from '../../src/city/defs';
import { World } from '../../src/city/world';

const make = (): World => new World({ seed: 112, difficulty: 'd3', klass: 'warlord', tutorial: true });

describe('LAST CITY frame cleanup', () => {
  it('keeps live entity arrays stable while discarding inactive vehicles and loot', () => {
    const world = make(), vehicles = world.vehicles, loot = world.loot, structures = world.structures;
    const hq = world.hq(0)!;
    const car = world.spawnVehicle('sedan', hq.x + 200, hq.y + 200, 0);
    const cash = world.spawnLoot('cash', hq.x + 240, hq.y + 240, 100);
    car.alive = false;
    cash.alive = false;

    world.step(1 / 60);

    expect(world.vehicles).toBe(vehicles);
    expect(world.loot).toBe(loot);
    expect(world.structures).toBe(structures);
    expect(vehicles).not.toContain(car);
    expect(loot).not.toContain(cash);
    expect(structures).toContain(hq);
  });

  it('compacts dead actors in place when the corpse threshold is reached', () => {
    const world = make(), actors = world.actors, boss = world.boss(0)!;
    for (let i = 0; i < 65; i++) {
      const dead = world.spawnActor('civ', CIV, boss.x + i, boss.y + 100);
      dead.alive = false;
      world.byId.delete(dead.id);
    }

    world.step(1 / 60);

    expect(world.actors).toBe(actors);
    expect(actors.some(actor => !actor.alive)).toBe(false);
    expect(actors).toContain(boss);
  });
});
