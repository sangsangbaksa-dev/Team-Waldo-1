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
    player.pitch = -1;
    let steps = 0;
    while (player.alive && steps < 2000) {
      sim.step(DT, NEUTRAL);
      steps++;
    }
    expect(player.alive).toBe(false);
  });
});
