import { describe, expect, it } from 'vitest';
import {
  createNearMiss, nearMissRemaining, stepNearMiss, NEAR_MISS_WINDOW,
  type NearMissRival, type NearMissState,
} from '../../src/race/near-miss';
import { createRace } from '../../src/race/race';
import { buildTrack } from '../../src/race/track';

const DT = 1 / 90;
const driver = { x: 0, z: 0, h: 0, vf: 48 };
const target = (id = 1, side = 3.1, speed = 36): NearMissRival =>
  ({ id, car: { x: 10, z: side, h: 0, vf: speed } });

function pass(state: NearMissState, rival: NearMissRival, start: number, crashedAt = -1) {
  const result: Array<{ chain: number; nitro: number }> = [];
  for (let i = 0; i < 155; i++) {
    rival.car.x = 10 - i * 0.1;
    result.push(...stepNearMiss(state, driver, [rival], start + i * DT, i === crashedAt));
  }
  return result;
}

describe('SPEED RUSH near-miss overtakes', () => {
  it('rewards a genuine close and clean pass once', () => {
    const state = createNearMiss(), rival = target();
    const rewards = pass(state, rival, 0);
    expect(rewards).toHaveLength(1);
    expect(rewards[0].nitro).toBeGreaterThan(0.05);
    expect(rewards[0].nitro).toBeLessThanOrEqual(0.14);
    expect(state.total).toBe(1);
    expect(state.bestChain).toBe(1);
    expect(nearMissRemaining(state, state.lastAt)).toBe(NEAR_MISS_WINDOW);
    // Remaining beside the car, or rewinding the same pass before cooldown,
    // must not hand out another nitro charge.
    expect(pass(state, rival, state.lastAt + 1)).toHaveLength(0);
  });

  it('continues a timed combo across different opponents and expires after inactivity', () => {
    const state = createNearMiss();
    expect(pass(state, target(1), 0)).toHaveLength(1);
    const second = pass(state, target(2, -3.5), state.lastAt + 2);
    expect(second).toHaveLength(1);
    expect(second[0].chain).toBe(2);
    expect(state.bestChain).toBe(2);
    const third = pass(state, target(3), state.lastAt + NEAR_MISS_WINDOW + 1);
    expect(third).toHaveLength(1);
    expect(third[0].chain).toBe(1);
    expect(state.total).toBe(3);
    expect(state.bestChain).toBe(2);
  });

  it('rejects dangerous gaps, wide passes and cars moving at the same speed', () => {
    for (const rival of [target(1, 2.2), target(2, 6.2), target(3, 3.1, 46)]) {
      const state = createNearMiss();
      expect(pass(state, rival, 0)).toHaveLength(0);
      expect(state.total).toBe(0);
    }
    const slow = { ...driver, vf: 22 };
    const state = createNearMiss();
    expect(stepNearMiss(state, slow, [target()], 0)).toHaveLength(0);
  });

  it('ignores remote cars, reversed headings, and teleport-like position changes', () => {
    const remote = target(); remote.link = { snap: null };
    expect(pass(createNearMiss(), remote, 0)).toHaveLength(0);
    const backwards = target(); backwards.car.h = Math.PI;
    expect(pass(createNearMiss(), backwards, 0)).toHaveLength(0);
    const state = createNearMiss(), rival = target();
    expect(stepNearMiss(state, driver, [rival], 0)).toHaveLength(0);
    rival.car.x = -5;
    expect(stepNearMiss(state, driver, [rival], DT)).toHaveLength(0);
  });

  it('cancels an armed pass and its combo on a collision', () => {
    const state = createNearMiss();
    expect(pass(state, target(1), 0)).toHaveLength(1);
    const rival = target(2);
    expect(stepNearMiss(state, driver, [rival], state.lastAt + 1)).toHaveLength(0);
    expect(stepNearMiss(state, driver, [rival], state.lastAt + 1 + DT, true)).toHaveLength(0);
    expect(state.chain).toBe(0);
    rival.car.x = -5;
    expect(stepNearMiss(state, driver, [rival], state.lastAt + 1 + DT * 2)).toHaveLength(0);
    expect(state.bestChain).toBe(1);
    expect(state.total).toBe(1);
  });

  it('initializes each race without carrying over temporary combo rewards', () => {
    const track = buildTrack();
    const first = createRace(track), second = createRace(track, 3, Infinity, { trial: true });
    first.nearMiss.chain = 5;
    expect(second.nearMiss.chain).toBe(0);
    expect(second.nearMiss.total).toBe(0);
    expect(second.nearMiss.targets.size).toBe(0);
  });
});
