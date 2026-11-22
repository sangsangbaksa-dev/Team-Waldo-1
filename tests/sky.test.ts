import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DIFFS, SEA_Y, SkySim, terrainY, type Input } from '../src/sky/sim';

const NEUTRAL: Input = { pitch: 0, roll: 0, throttle: 0.5, fire: false, missile: false, flare: false };
const DT = 0.05;

describe('terrainY', () => {
  it('is 0 far from every island and positive at an island center', () => {
    expect(terrainY(-9000, -9000)).toBe(0);
    expect(terrainY(1200, 300)).toBeGreaterThan(0);
  });
  it('sea level is 0', () => {
    expect(SEA_Y).toBe(0);
  });
});

describe('SkySim waves', () => {
  it('spawns wave 1 with enemies after the intermission', () => {
    const sim = new SkySim(DIFFS[1]);
    for (let i = 0; i < 600; i++) sim.step(DT, NEUTRAL);
    expect(sim.wave).toBeGreaterThanOrEqual(1);
    expect(sim.enemies().length).toBeGreaterThan(0);
  });
});

describe('SkySim gunfire', () => {
  it('a bullet fired at an enemy directly in front reduces its hp', () => {
    const sim = new SkySim(DIFFS[1]);
    const player = sim.player;
    player.pos.set(0, 700, 2200);
    player.q.identity();
    const enemy = sim.makeJet('enemy', 'fighter', new THREE.Vector3(0, 700, 2200 - 300), 1);
    const hpBefore = enemy.hp;
    sim.fireGun(player, 0);
    // pin the target so its AI cannot climb out of the bullet path; this isolates the hit check
    for (let i = 0; i < 20 && enemy.alive; i++) {
      enemy.pos.set(0, 700, 1900);
      sim.step(DT, NEUTRAL);
    }
    expect(enemy.hp).toBeLessThan(hpBefore);
  });
});

describe('SkySim crash', () => {
  it('a player diving straight down into the sea dies', () => {
    const sim = new SkySim(DIFFS[1]);
    const player = sim.player;
    const dive: Input = { ...NEUTRAL, pitch: -1 };
    let steps = 0;
    while (player.alive && steps < 2000) {
      sim.step(DT, dive);
      steps++;
    }
    expect(player.alive).toBe(false);
  });
});

describe('combat rewards', () => {
  it('awards one missile at three kills and respects the ammo cap', () => {
    const sim = new SkySim(DIFFS[1]);
    sim.player.missiles = 7;
    for (let i = 0; i < 3; i++) sim.kill(sim.makeJet('enemy', 'fighter', new THREE.Vector3(0, 700, 0), 1), sim.player.id);
    expect(sim.player.missiles).toBe(8);
    expect(sim.combo).toBe(3);
  });
  it('rewards a missile dodge once and extends an active combo', () => {
    const sim = new SkySim(DIFFS[1]);
    sim.combo = 2; sim.comboT = 1;
    sim.missiles.push({ id: 100, owner: 999, team: 'enemy', pos: sim.player.pos.clone().add(new THREE.Vector3(0, 0, 200)), vel: new THREE.Vector3(0, 0, 1), target: 0, life: 10, alive: true, nearPlayer: true });
    sim.step(DT, NEUTRAL);
    expect(sim.shield).toBe(5);
    expect(sim.comboT).toBeGreaterThan(5);
    sim.step(DT, NEUTRAL);
    expect(sim.shield).toBe(5);
  });
});

describe('SKY WAR missile and hit feedback', () => {
  it('lets the player fire at once, but only with a lock; reports the attacker on hits', async () => {
    const sim = new SkySim(DIFFS[1]!);
    sim.step(DT, NEUTRAL);
    expect(sim.player.missileCd).toBeLessThanOrEqual(0);
    const before = sim.player.missiles; sim.events.length = 0;
    sim.step(DT, { ...NEUTRAL, missile: true });
    expect(sim.player.missiles).toBe(before);
    expect(sim.events.some(e => e.t === 'nolock')).toBe(true);
    sim.events.length = 0;
    sim.damage(sim.player, 1, 4242, sim.player.pos);
    expect(sim.events.find(e => e.t === 'hit' && e.id === sim.player.id)).toMatchObject({ by: 4242 });
  });
});
