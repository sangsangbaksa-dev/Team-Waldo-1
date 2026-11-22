import { describe, expect, it } from 'vitest';
import { RtsSim } from '../../src/rts/sim';
import { G_FOREST, G_PLAIN, RULES } from '../../src/rts/terrain';

describe('forest target visibility', () => {
  for (const owner of [0, 1]) it(`limits targets for side ${owner}`, () => {
    const sim = new RtsSim();
    const attacker = sim.units.find(u => u.owner === owner)!;
    const target = sim.units.find(u => u.owner !== owner)!;
    sim.units = [attacker, target];
    attacker.x = 40; attacker.y = 40;
    target.x = 40 + RULES.forestSight + 1; target.y = 40;
    const cell = Math.floor(target.y) * sim.map.size + Math.floor(target.x);
    sim.map.ground[cell] = G_FOREST;
    expect(sim.pick(owner, attacker.x, attacker.y, 10)).toBeNull();
    sim.map.ground[cell] = G_PLAIN;
    expect(sim.pick(owner, attacker.x, attacker.y, 10)).toBe(target);
    sim.map.ground[cell] = G_FOREST;
    attacker.x = target.x - RULES.forestSight;
    expect(sim.pick(owner, attacker.x, attacker.y, 10)).toBe(target);
    attacker.x -= 1;
    attacker.o = { t: 'attack', x: 0, y: 0, target: target.id, phase: 0, timer: 0 };
    const hp = target.hp;
    sim.step();
    expect(attacker.o.t).toBe('idle');
    expect(target.hp).toBe(hp);
  });
});
