import { describe, expect, it } from 'vitest';
import { SoloSession } from '../src/application/session.js';
import { neutralInput, TICK } from '../src/domain/combat.js';
import { horizontalDistance, vec } from '../src/domain/math.js';
import { createWorld, HALF_MAP } from '../src/domain/world.js';

const world = createWorld();

describe('Foundry terrain', () => {
  it('has repeatable elevations and distributed valid spawn points', () => {
    const alternate = createWorld();
    expect(world.cover).toEqual(alternate.cover);
    const heights = [];
    for (let x = -HALF_MAP; x <= HALF_MAP; x += 16) {
      for (let z = -HALF_MAP; z <= HALF_MAP; z += 16) heights.push(world.heightAt(x, z));
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(56);
    expect(world.cover.length).toBeGreaterThan(500);
    expect(world.spawns.every(p => world.canStand(p.x, p.z, 1.8))).toBe(true);
  });

  it('traces oriented cover and the terrain independently', () => {
    const bag = world.cover.find(cover => cover.kind === 'sandbag')!;
    expect(world.canStand(bag.x, bag.z, 1.8)).toBe(false);
    expect(world.trace(vec(bag.x, bag.y + 5, bag.z), vec(bag.x, bag.y, bag.z))).toBeLessThan(1);
    const y = world.heightAt(500, 500);
    expect(world.trace(vec(500, y + 1, 500), vec(500, y - 1, 500))).toBeCloseTo(0.5, 1);
  });

  it('spawns five bots that relocate and take shots on the shared map', () => {
    const session = new SoloSession(world, 'NOMAD');
    const start = session.snapshot;
    expect(start.players.filter(player => player.bot)).toHaveLength(5);
    let shots = 0;
    let last = 0;
    for (let i = 0; i < 28 * 60; i++) {
      session.update(neutralInput(0), TICK);
      for (const event of session.snapshot.events) {
        if (event.serial <= last) continue;
        last = event.serial;
        if (event.type === 'shot' && event.player.startsWith('bot-')) shots++;
      }
    }
    const moved = session.snapshot.players.filter(player => player.bot
      && horizontalDistance(player.position, start.players.find(initial => initial.id === player.id)!.position) > 8);
    expect(moved.length).toBeGreaterThanOrEqual(3);
    expect(shots).toBeGreaterThan(3);
  });
});
