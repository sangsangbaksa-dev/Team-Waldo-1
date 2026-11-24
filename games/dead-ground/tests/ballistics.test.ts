import { describe, expect, it } from 'vitest';
import { advanceBullet, aimSway, eye, hitPlayer, movePlayer, neutralInput, RIFLE, shotLead, type Bullet } from '../src/domain/combat.js';
import { Match } from '../src/domain/match.js';
import { segmentBox, segmentSphere, vec } from '../src/domain/math.js';
import type { World } from '../src/domain/world.js';

const world: World = {
  heightAt: () => 0, canStand: () => true, trace: () => Infinity,
  cover: [], spawns: [vec(), vec(0, 0, -50)],
};

describe('ballistics', () => {
  it('integrates travel and gravity over time', () => {
    const bullet: Bullet = { id: 1, owner: 'p', position: vec(0, 2, 0), velocity: vec(0, 0, -RIFLE.velocity), expires: 4 };
    expect(advanceBullet(bullet, 0.25)).toEqual(vec(0, 2 - RIFLE.gravity * 0.25 ** 2 / 2, -RIFLE.velocity / 4));
    bulletinStep(bullet, 0.125);
    expect(advanceBullet(bullet, 0.125)).toEqual(vec(0, 2 - RIFLE.gravity * 0.25 ** 2 / 2, -RIFLE.velocity / 4));
  });

  it('checks only the finite projectile segment and distinguishes head and torso', () => {
    const match = new Match(world);
    const target = match.addPlayer('p', 'PLAYER')!;
    expect(segmentSphere(vec(0, 0, 2), vec(0, 0, 1), vec(), 0.1)).toBe(Infinity);
    expect(segmentBox(vec(0, 0, 2), vec(0, 0, -2), vec(-1, -1, -1), vec(1, 1, 1))).toBe(0.25);
    const y = eye(target).y;
    expect(hitPlayer(vec(0, y, 1), vec(0, y, -1), target).headshot).toBe(true);
    expect(hitPlayer(vec(0, 1, 1), vec(0, 1, -1), target).headshot).toBe(false);
    expect(hitPlayer(vec(2, y, 1), vec(2, y, -1), target).fraction).toBe(Infinity);
  });

  it('leads a moving target and ignores an impossible sample', () => {
    const still = shotLead(vec(0, 2, -40), vec(), 40);
    const moving = shotLead(vec(0, 2, -40), vec(8, 0, 0), 40);
    expect(moving.x).toBeGreaterThan(still.x);
    expect(moving.y).toBeLessThan(2);
    expect(shotLead(vec(), vec(80, 0, 0), RIFLE.velocity).x).toBeCloseTo(12);
  });

  it('reduces sway while holding breath', () => {
    const scoped = { aiming: true, steady: false, moving: false, crouched: false };
    const sway = aimSway(scoped, 1.7);
    const steady = aimSway({ ...scoped, steady: true }, 1.7);
    expect(Math.hypot(steady.yaw, steady.pitch)).toBeLessThan(Math.hypot(sway.yaw, sway.pitch) * 0.2);
  });
});

describe('movement', () => {
  it('normalizes diagonal input, blocks collision, and limits sprint while scoped', () => {
    const player = { position: vec(), height: 1.8, crouched: false, moving: false, sprinting: false };
    const input = { ...neutralInput(), forward: 1, strafe: 1, sprint: true };
    const direct = movePlayer(world, player, { ...input, strafe: 0 }, 0.1);
    const diagonal = movePlayer(world, player, input, 0.1);
    expect(Math.hypot(diagonal.position.x, diagonal.position.z)).toBeCloseTo(1);
    expect(direct.position.z).toBeCloseTo(-1);
    expect(movePlayer(world, player, { ...input, aim: true, strafe: 0 }, 0.1).position.z).toBeCloseTo(-0.27);
    const blocked = { ...world, canStand: (x: number) => x <= 0 };
    expect(movePlayer(blocked, player, input, 0.1).position.x).toBe(0);
  });
});

function bulletinStep(bullet: Bullet, dt: number): void {
  bullet.position = advanceBullet(bullet, dt);
  bullet.velocity.y -= RIFLE.gravity * dt;
}
