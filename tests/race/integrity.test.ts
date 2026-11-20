import { describe, expect, it } from 'vitest';
import { buildTrack } from '../../src/race/track';
import { createRace, inSlipstream, placeOf, updateRace } from '../../src/race/race';
import { newCar, separateCars, type CarInput } from '../../src/race/physics';
const track = buildTrack();
const idle: CarInput = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };

describe('SPEED RUSH race integrity', () => {
  it('does not give drafting bonuses for oncoming traffic', () => {
    const me = newCar(track, 40, 0), lead = newCar(track, 40, 0);
    me.vf = lead.vf = 50;
    lead.x += Math.cos(me.h) * 15; lead.z += Math.sin(me.h) * 15;
    expect(inSlipstream(me, [lead])).toBe(true);
    lead.h += Math.PI;
    expect(inSlipstream(me, [lead])).toBe(false);
  });
  it('never awards new finishes after the player result is recorded', () => {
    const race = createRace(track, 1);
    race.phase = 'done'; race.clock = 42;
    race.player.finishTime = 42;
    race.player.lapTimes = [42];
    const rival = race.racers[1]; rival.car.total = track.n + 5;
    for (let i = 0; i < 10; i++) expect(updateRace(race, 1 / 90, idle).some(e => e.type === 'finish' || e.type === 'lap')).toBe(false);
    expect(rival.finishTime).toBeNull(); expect(rival.lapTimes).toEqual([]);
    expect(placeOf(race)).toBe(1);
    expect(race.clock).toBe(42);
  });
  it('skips separated collision pairs while still resolving overlapping cars', () => {
    const a = newCar(track, 0, 0), b = newCar(track, 0, 0);
    b.x += 100; const before = b.x;
    expect(separateCars(a, b)).toBe(0); expect(b.x).toBe(before);
    b.x = a.x; b.z = a.z;
    separateCars(a, b);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(4);
  });
});
