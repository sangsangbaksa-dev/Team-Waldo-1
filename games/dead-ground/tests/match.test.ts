import { describe, expect, it } from 'vitest';
import { eye, MAX_PLAYERS, neutralInput, PROTECTION_SECONDS, RESPAWN_SECONDS, RIFLE, SCORE_LIMIT, TICK } from '../src/domain/combat.js';
import { Match } from '../src/domain/match.js';
import { vec } from '../src/domain/math.js';
import type { World } from '../src/domain/world.js';

function arena(block = false) {
  const world: World = {
    heightAt: () => 0, canStand: () => true,
    trace: (a, b) => block && a.z > -48 && b.z < -48 ? (a.z + 48) / (a.z - b.z) : Infinity,
    cover: [], spawns: [vec(), vec(0, 0, -50), vec(48, 0, 18)],
  };
  const match = new Match(world);
  const a = match.addPlayer('a', 'NOMAD')!;
  const b = match.addPlayer('b', 'ROOK')!;
  match.start();

  function tick(seconds: number) {
    for (let t = 0; t < Math.round(seconds / TICK); t++) match.step();
  }
  function projectile(y: number, at = -46) {
    const id = match.bullets.size + 1;
    match.bullets.set(id, { id, owner: a.id, position: vec(0, y, at), velocity: vec(0, 0, -RIFLE.velocity), expires: match.time + 4 });
    match.step();
  }
  return { match, a, b, tick, projectile };
}

describe('match rules', () => {
  it('applies body damage, eliminates on a headshot, and respawns under protection', () => {
    const { match, a, b, tick, projectile } = arena();
    tick(PROTECTION_SECONDS + TICK);
    projectile(1.05);
    expect(b.health).toBe(35);
    expect(a.kills).toBe(0);
    projectile(eye(b).y);
    expect(b.alive).toBe(false);
    expect(b.deaths).toBe(1);
    expect(a.kills).toBe(1);
    expect(a.headshots).toBe(1);
    expect(match.snapshot().events.some(event => event.type === 'kill' && event.headshot)).toBe(true);
    tick(RESPAWN_SECONDS + TICK);
    expect(b.alive).toBe(true);
    expect(b.ammo).toBe(RIFLE.magazine);
    expect(b.protectedUntil - match.time).toBeCloseTo(PROTECTION_SECONDS);
  });

  it('passes through spawn protection and stops against intervening cover', () => {
    const safe = arena();
    safe.projectile(eye(safe.b).y);
    expect(safe.b.health).toBe(100);
    expect(safe.match.bullets.size).toBe(1);
    const blocked = arena(true);
    blocked.tick(PROTECTION_SECONDS + TICK);
    blocked.projectile(eye(blocked.b).y);
    expect(blocked.b.health).toBe(100);
    expect(blocked.match.bullets.size).toBe(0);
    expect(blocked.match.snapshot().events.some(event => event.type === 'impact')).toBe(true);
  });

  it('enforces bolt cycling, finishes reloads, and drops protection when firing', () => {
    const { match, a, tick } = arena();
    const input = { ...neutralInput(), aim: true, breath: true, fire: 1 };
    match.setInput(a.id, input);
    match.step();
    expect(a.steady).toBe(true);
    expect(a.ammo).toBe(4);
    expect(a.protectedUntil).toBe(match.time);
    expect(match.bullets.size).toBe(1);
    match.setInput(a.id, { ...input, fire: 2 });
    match.step();
    expect(a.ammo).toBe(4);
    tick(RIFLE.cycle + TICK);
    expect(a.ammo).toBe(4);
    match.setInput(a.id, { ...input, fire: 2, reload: 1 });
    match.step();
    tick(RIFLE.reload + TICK);
    expect(a.ammo).toBe(5);
    expect(a.reserve).toBe(29);
  });

  it('drops a pending shot and movement when input is frozen', () => {
    const { match, a } = arena();
    const input = { ...neutralInput(), forward: 1, fire: 1 };
    match.setInput(a.id, input);
    match.freezeInput(a.id, input);
    const z = a.position.z;
    match.step();
    expect(a.ammo).toBe(RIFLE.magazine);
    expect(a.position.z).toBeCloseTo(z);
    expect(match.bullets.size).toBe(0);
  });

  it('requires release to recover full use of a depleted breath meter', () => {
    const { match, a, tick } = arena();
    match.setInput(a.id, { ...neutralInput(), aim: true, breath: true });
    tick(4.1);
    expect(a.breathExhausted).toBe(true);
    tick(3);
    expect(a.steady).toBe(false);
    match.setInput(a.id, { ...neutralInput(), aim: true });
    match.step();
    match.setInput(a.id, { ...neutralInput(), aim: true, breath: true });
    match.step();
    expect(a.steady).toBe(true);
  });

  it('caps the roster, ends on the kill limit or timer, and resets for a rematch', () => {
    const { match, a, b, tick } = arena();
    for (let index = 2; index < MAX_PLAYERS; index++) match.addPlayer(String(index), String(index));
    expect(match.addPlayer('overflow', 'EXTRA')).toBeUndefined();
    a.kills = SCORE_LIMIT;
    expect(match.step()).toBe(true);
    expect(match.snapshot().phase).toBe('finished');
    expect(match.snapshot().players[0].id).toBe(a.id);
    expect(match.start()).toBe(true);
    expect(a.kills).toBe(0);
    expect(b.alive).toBe(true);
    expect(match.snapshot().round).toBe(2);
    match.remaining = TICK * 2;
    tick(TICK * 2);
    expect(match.snapshot().phase).toBe('finished');
  });
});
