import { describe, expect, it } from 'vitest';
import { edgeRecoveryRate } from '../src/sky/domain/flight';
import { flightLine, radarBox } from '../src/sky/ui/instruments';
import { DIFFS, SkySim, WORLD_R, type Input } from '../src/sky/sim';

const NEUTRAL: Input = { pitch: 0, roll: 0, throttle: 0.5, fire: false, missile: false, flare: false };

describe('edge recovery', () => {
  it('stays off in the middle of the map and turns on inside the warning band', () => {
    expect(edgeRecoveryRate(0)).toBe(0);
    expect(edgeRecoveryRate(0.2)).toBe(0);
    expect(edgeRecoveryRate(0.28)).toBeGreaterThan(0.5);
  });
  it('yaws inward before the player is pinned to the hard boundary', () => {
    const sim = new SkySim(DIFFS[1]);
    const player = sim.player;
    player.pos.set(WORLD_R * 0.97, 800, 0);
    player.yaw = 0;
    player.q.identity();
    sim.step(0.05, NEUTRAL);
    expect(Math.abs(player.yaw)).toBeGreaterThan(0);
  });
});

describe('flight instruments', () => {
  it('prints speed in km/h and marks a stall', () => {
    expect(flightLine(100, 1.2, 70)).toEqual({ text: '360 km/h · 1.2 G', stalling: false });
    expect(flightLine(50, 0.8, 70).stalling).toBe(true);
  });
  it('keeps the radar above the touch weapon stack', () => {
    const mouse = radarBox(1280, 720, false);
    const touch = radarBox(390, 844, true);
    expect(mouse.y).toBeGreaterThan(720 - mouse.r - 40);
    expect(touch.y + touch.r).toBeLessThan(844 - 160);
  });
});
