import { describe, expect, it } from 'vitest';
import { newCar, stepCar, PLAYER_PARAMS, type CarInput } from '../../src/race/physics';
import { inSlipstream } from '../../src/race/race';
import { buildTrack } from '../../src/race/track';

const track = buildTrack(), GAS: CarInput = { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false };

describe('SPEED RUSH slipstream', () => {
  it('detects only a fast car directly behind another', () => {
    const lead = newCar(track, 40 + Math.round(15 / track.ds), 0), me = newCar(track, 40, 0);
    lead.vf = me.vf = 50;
    expect(inSlipstream(me, [lead, me])).toBe(true);
    const off = newCar(track, 40 + Math.round(15 / track.ds), 6); off.vf = 50; expect(inSlipstream(me, [off, me])).toBe(false);
    me.vf = 10; expect(inSlipstream(me, [lead, me])).toBe(false);
    const behind = newCar(track, 40 - Math.round(15 / track.ds), 0); behind.vf = 50; me.vf = 50; expect(inSlipstream(me, [behind, me])).toBe(false);
  });
  it('lets a charged draft go faster and accelerate harder', () => {
    const run = (draft: number): number => { const c = newCar(track, 0, 0); c.draft = draft; for (let i = 0; i < 90 * 20; i++) stepCar(c, GAS, 1 / 90, track, PLAYER_PARAMS); return c.vf; };
    expect(run(1)).toBeGreaterThan(run(0) + 1);
  });
});
