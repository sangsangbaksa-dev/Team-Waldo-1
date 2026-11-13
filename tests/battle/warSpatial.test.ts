import { describe, expect, it } from 'vitest';
import { createWar, stepWar, type Unit } from '../../src/battle/war';
import { recruitGeneral, assignGeneral, activateGeneralAbility, generalBonus } from '../../src/battle/base';
import { operationsBonus, useSupport } from '../../src/battle/operations';
import { commandSquad } from '../../src/battle/squads';
import { WarSpatialIndex } from '../../src/battle/warSpatial';
import { decodeWar, encodeWar } from '../../src/battle/save';

const soldier = (id: number, owner: number, x: number, z: number): Unit =>
  ({ id, owner, x, z, kind: 'infantry', hp: 52, cooldown: 0, squad: 0 });

describe('reusable combat spatial index', () => {
  it('keeps source-array ties within a cell even when owners are grouped separately', () => {
    const w = createWar(), index = new WarSpatialIndex();
    const attacker = soldier(100, 0, 0, 0);
    const first = soldier(101, 2, 3, 0), second = soldier(102, 1, -3, 0);
    index.rebuild([attacker, first, second], w.factions, 260);
    expect(index.nearestEnemy(attacker, w.factions, 12)).toBe(first);
    index.rebuild([attacker, second, first], w.factions, 260);
    expect(index.nearestEnemy(attacker, w.factions, 12)).toBe(second);
  });

  it('preserves combat cell ties and the HQ global source-order tie independently', () => {
    const w = createWar(), index = new WarSpatialIndex();
    const attacker = soldier(100, 0, 4, 0);
    const sourceFirst = soldier(101, 1, 6, 0), earlierCell = soldier(102, 2, 2, 0);
    index.rebuild([attacker, sourceFirst, earlierCell], w.factions, 260);
    expect(index.nearestEnemy(attacker, w.factions, 12)).toBe(earlierCell);
    const hq = { ...w.factions[0], x: 4, z: 0 };
    expect(index.nearestInvader(hq, w.factions, 13)).toBe(sourceFirst);
  });

  it('observes deaths immediately and clears stale units on the next rebuild', () => {
    const w = createWar(), index = new WarSpatialIndex();
    const attacker = soldier(100, 0, 0, 0), enemy = soldier(101, 1, 2, 0);
    index.rebuild([attacker, enemy], w.factions, 260);
    expect(index.nearestEnemy(attacker, w.factions, 12)).toBe(enemy);
    enemy.hp = 0;
    expect(index.nearestEnemy(attacker, w.factions, 12)).toBeUndefined();
    expect(index.ownerCountsAt(0, 0, 7.5, w.factions)).toEqual([1, 0, 0, 0]);
    enemy.hp = 52;
    w.factions[1].hp = 0;
    expect(index.nearestEnemy(attacker, w.factions, 12)).toBeUndefined();
    index.rebuild([], w.factions, 260);
    expect(index.ownerCountsAt(0, 0, 7.5, w.factions)).toEqual([0, 0, 0, 0]);
  });

  it('counts units that cross an indexed cell boundary into a capture circle', () => {
    const w = createWar(), index = new WarSpatialIndex(), runner = soldier(100, 0, 3, 0);
    index.rebuild([runner], w.factions, 260);
    expect(index.ownerCountsAt(11.6, 0, 7.5, w.factions)[0]).toBe(0);
    runner.x = 4.2;
    index.recordMovement(runner);
    expect(index.ownerCountsAt(11.6, 0, 7.5, w.factions)[0]).toBe(1);
    expect(index.ownerCountsAt(11.6, 0, 7.5, w.factions)[1]).toBe(0);
  });

  it('detects a fast enemy that crosses into range from outside the original 3x3 cells', () => {
    const w = createWar({ mapId: 'continental' }), index = new WarSpatialIndex();
    const runner = soldier(100, 0, -14.05, 0), archer = soldier(101, 1, 8.001, 0);
    index.rebuild([runner, archer], w.factions, 520);
    expect(index.nearestEnemy(archer, w.factions, 18)).toBeUndefined();
    runner.x += 4.2137928;
    index.recordMovement(runner);
    expect(Math.abs(archer.x - runner.x)).toBeLessThan(18);
    expect(index.nearestEnemy(archer, w.factions, 18)).toBe(runner);
  });

  it('combines Sora active orders and marching support without losing same-tick combat or saves', () => {
    const w = createWar({ mapId: 'continental' }), faction = w.factions[0];
    faction.gold = 10000; faction.food = 10000; faction.barracks = 3; faction.research.logistics = 3;
    const runner = w.units.find(unit => unit.owner === 0)!;
    const archer = w.units.find(unit => unit.owner === 1)!;
    w.units = [runner, archer];
    runner.kind = 'cavalry'; runner.hp = 82; runner.x = -14.05; runner.z = 0;
    archer.kind = 'archer'; archer.hp = 36; archer.x = 8.001; archer.z = 0;
    w.factions.slice(1).forEach(f => { f.aiTimer = 10000; f.turretCooldown = 10; });
    expect(recruitGeneral(w, 'sora')).toBe(true);
    expect(assignGeneral(w, 'sora', 0)).toBe(true);
    expect(activateGeneralAbility(w, 'sora')).toBe(true);
    expect(useSupport(w, 'march', 0)).toBe(true);
    expect(generalBonus(w, runner, 'speed')).toBeCloseTo(.45);
    expect(operationsBonus(w, runner, 'speed')).toBeCloseTo(.4);
    expect(commandSquad(w, 0, { kind: 'move', x: 80, z: 0 })).toBe(true);
    stepWar(w, .1);
    expect(runner.x).toBeCloseTo(-9.8362072);
    // The archer notices the incoming rider and moves toward it, not back to HQ.
    expect(archer.x).toBeLessThan(8.001);
    expect(decodeWar(encodeWar(w))).toEqual(w);
  });

  it('excludes exact range boundaries, as the original combat and capture rules did', () => {
    const w = createWar(), index = new WarSpatialIndex();
    const attacker = soldier(100, 0, 0, 0), enemy = soldier(101, 1, 12, 0);
    index.rebuild([attacker, enemy], w.factions, 260);
    expect(index.nearestEnemy(attacker, w.factions, 12)).toBeUndefined();
    expect(index.ownerCountsAt(4.5, 0, 7.5, w.factions)[1]).toBe(0);
    enemy.x = 13;
    index.rebuild([attacker, enemy], w.factions, 260);
    expect(index.nearestInvader({ ...w.factions[0], x: 0, z: 0 }, w.factions, 13)).toBeUndefined();
  });

  it('allows a same-tick kill to clear a contested post without adding cache data to saves', () => {
    const w = createWar(), post = w.outposts[4];
    const player = w.units.find(unit => unit.owner === 0)!;
    const enemy = w.units.find(unit => unit.owner === 1)!;
    w.units = [player, enemy];
    player.x = 0; player.z = 0; player.cooldown = 0;
    enemy.x = .3; enemy.z = 0; enemy.hp = 1;
    w.factions[0].rally = post.id;
    w.factions.slice(1).forEach(f => { f.aiTimer = 10000; });
    post.contender = 0; post.progress = 99.8;
    stepWar(w, .1);
    expect(w.stats[0].kills).toBe(1);
    expect(w.stats[1].lost).toBe(1);
    expect(post.owner).toBe(0);
    expect(w.units).toEqual([player]);
    expect(decodeWar(encodeWar(w))).toEqual(w);
    expect(encodeWar(w)).not.toContain('spatial');
  });
});
