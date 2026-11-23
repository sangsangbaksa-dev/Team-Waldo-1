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
  it('does not give a draft from oncoming or sideways traffic', () => {
    const me = newCar(track, 20, 0), lead = newCar(track, 20, 0);
    me.x = 0; me.z = 0; me.h = 0; me.vf = 50;
    lead.x = 15; lead.z = 0; lead.vf = 50;
    lead.h = Math.PI;
    expect(inSlipstream(me, [lead])).toBe(false);
    lead.h = Math.PI / 2;
    expect(inSlipstream(me, [lead])).toBe(false);
    lead.h = 0;
    expect(inSlipstream(me, [lead])).toBe(true);
  });

  it('lets a charged draft go faster and accelerate harder', () => {
    // 조향 없이 달리면 결국 벽을 긁습니다. 벽에서는 이제 속도를 거의 잃지 않아 끝 속도가 들쭉날쭉하므로 최고 속도로 비교합니다.
    const run = (draft: number): number => { const c = newCar(track, 0, 0); c.draft = draft; let top = 0; for (let i = 0; i < 90 * 20; i++) { stepCar(c, GAS, 1 / 90, track, PLAYER_PARAMS); top = Math.max(top, c.vf); } return top; };
    expect(run(1)).toBeGreaterThan(run(0) + 1);
  });
});
