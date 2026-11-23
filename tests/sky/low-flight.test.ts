import { describe, expect, it } from 'vitest';
import { LowFlightChallenge, LOW_FLIGHT_RULES } from '../../src/sky/low-flight';

const jet = () => ({ alive: true, speed: 200, fuel: 0.4 });

describe('terrain-skimming challenge', () => {
  it('awards once after sustained eligible flight, then enforces a cooldown', () => {
    const challenge = new LowFlightChallenge();
    const plane = jet();
    let reward = null;
    for (let tick = 0; tick < 13; tick++) reward = challenge.advance(0.1, plane, 140, 75);
    expect(reward).toEqual({ points: 180, fuel: 0.12 });
    expect(challenge.runs).toBe(1);
    expect(challenge.charge).toBe(0);
    for (let tick = 0; tick < 40; tick++) {
      expect(challenge.advance(0.1, plane, 140, 75)).toBeNull();
    }
    expect(challenge.runs).toBe(1);
    expect(challenge.cooldown).toBeGreaterThan(0);
  });

  it('requires land, safe clearance and sufficient speed', () => {
    const challenge = new LowFlightChallenge();
    const plane = jet();
    const invalid = [
      { terrain: 0, clearance: 70, speed: 200 },
      { terrain: 50, clearance: 12, speed: 200 },
      { terrain: 50, clearance: 145, speed: 200 },
      { terrain: 50, clearance: 70, speed: 150 },
    ];
    for (const check of invalid) {
      plane.speed = check.speed;
      expect(challenge.advance(2, plane, check.terrain, check.clearance)).toBeNull();
      expect(challenge.charge).toBe(0);
    }
    plane.speed = 200;
    plane.alive = false;
    expect(challenge.advance(2, plane, 50, 70)).toBeNull();
  });

  it('cancels interrupted runs and caps fuel rewards at available capacity', () => {
    const challenge = new LowFlightChallenge();
    const plane = jet();
    challenge.advance(1.1, plane, 75, 80);
    expect(challenge.charge).toBeGreaterThan(1);
    challenge.advance(0.1, plane, 0, 80);
    expect(challenge.charge).toBe(0);
    plane.fuel = 0.97;
    expect(challenge.advance(LOW_FLIGHT_RULES.duration, plane, 75, 80)?.fuel).toBeCloseTo(0.03);
    challenge.reset();
    expect(challenge.runs).toBe(0);
    expect(challenge.cooldown).toBe(0);
  });
});

it('does not award a challenge or modify timers on invalid frame deltas', () => {
  const challenge = new LowFlightChallenge();
  for (const dt of [Number.NaN, Infinity, -Infinity, 0]) {
    expect(challenge.advance(dt, jet(), 140, 75)).toBeNull();
    expect(challenge.charge).toBe(0);
    expect(challenge.cooldown).toBe(0);
    expect(challenge.runs).toBe(0);
  }
});
