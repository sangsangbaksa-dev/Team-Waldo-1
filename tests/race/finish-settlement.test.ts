import { describe, expect, it } from 'vitest';
import { createRace, placeOf, updateRace } from '../../src/race/race';
import { buildTrack } from '../../src/race/track';
import type { CarInput } from '../../src/race/physics';

const t = buildTrack(), DT = 1 / 90;
const IDLE: CarInput = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };

describe('SPEED RUSH finish settlement', () => {
  it('resolves every racer crossing in the same tick before reporting a finish', () => {
    const r = createRace(t, 1);
    r.phase = 'racing';
    r.clock = 16;
    r.player.car.total = t.n + 1;
    r.racers[1].car.total = t.n + 2;
    const ev = updateRace(r, DT, IDLE);
    const finish = ev.filter(e => e.type === 'finish');
    expect(finish).toHaveLength(1);
    expect(r.racers[1].finishTime).not.toBeNull();
    expect(r.player.finishTime).not.toBeNull();
    expect(r.phase).toBe('done');
    expect(finish[0]).toMatchObject({ type: 'finish', place: placeOf(r) });
  });

  it('does not award new AI lap times after the race is already over', () => {
    const r = createRace(t, 1);
    r.phase = 'done';
    r.clock = 50;
    r.player.finishTime = 50;
    r.racers[1].car.total = t.n + 2;
    const ev = updateRace(r, DT, IDLE);
    expect(ev.some(e => e.type === 'finish' || e.type === 'lap')).toBe(false);
    expect(r.racers[1].finishTime).toBeNull();
    expect(r.clock).toBe(50);
  });
});
