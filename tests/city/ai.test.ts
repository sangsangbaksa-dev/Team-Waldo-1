import { describe, expect, it } from 'vitest';
import { thinkFaction } from '../../src/city/ai';
import { World } from '../../src/city/world';

const makeWorld = (): World => new World({ seed: 17, difficulty: 'd3', klass: 'warlord' });

describe('LAST CITY rival AI', () => {
  it('queues workers and keeps soldiers following the boss', () => {
    const world = makeWorld();
    const faction = world.factions[1];
    const hq = world.hq(faction.id)!;
    const boss = world.boss(faction.id)!;
    const soldier = world.spawnUnit('rifle', faction.id, boss.x + 20, boss.y);
    soldier.order = { type: 'move', x: boss.x + 200, y: boss.y };

    world.time = 400;
    faction.crystal = 5000;
    faction.cash = 5000;
    const queued = hq.queue.length;
    thinkFaction(world, faction);

    expect(hq.queue.length).toBeGreaterThan(queued);
    expect(hq.queue.some(item => item.unit === 'worker')).toBe(true);
    expect(soldier.order.type).toBe('follow');
  });

  it('prioritizes nearby loot over elective attacks and purchases', () => {
    const world = makeWorld();
    const faction = world.factions[1];
    const boss = world.boss(faction.id)!;
    world.loot.length = 0;
    const crate = world.spawnLoot('crate', boss.x + 60, boss.y + 25, 0);
    faction.ai.attackT = Number.POSITIVE_INFINITY;

    thinkFaction(world, faction);

    expect(faction.ai.goal).toBe('loot');
    expect({ x: faction.ai.tx, y: faction.ai.ty }).toEqual({ x: crate.x, y: crate.y });
    expect(boss.order.type).toBe('amove');
  });

  it('makes repeatable economy and tactical decisions for equal seeds', () => {
    const a = makeWorld();
    const b = makeWorld();

    for (let i = 0; i < 8; i++) {
      a.time = b.time = 140 + i * 60;
      thinkFaction(a, a.factions[2]);
      thinkFaction(b, b.factions[2]);
    }
    const snapshot = (world: World) => ({
      faction: {
        cash: world.factions[2].cash,
        crystal: world.factions[2].crystal,
        ai: world.factions[2].ai,
      },
      structures: world.structures.filter(s => s.f === 2).map(s => ({
        kind: s.kind, x: s.x, y: s.y, built: s.built,
        queue: s.queue.map(item => ({ ...item })),
      })),
      order: world.boss(2)?.order,
      rng: world.rng(),
    });
    expect(snapshot(a)).toEqual(snapshot(b));
  });
});
