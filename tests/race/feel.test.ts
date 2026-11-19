import { describe, expect, it } from 'vitest';
import { NITRO_KICK, newCar, stepCar, type CarInput } from '../../src/race/physics';
import { COUNTDOWN, createRace, updateRace } from '../../src/race/race';
import { buildTrack } from '../../src/race/track';

const track = buildTrack(), DT = 1 / 90;
const GAS: CarInput = { throttle: 1, brake: 0, steer: 0, drift: false, nitro: false }, NITRO: CarInput = { ...GAS, nitro: true };

describe('SPEED RUSH nitro kick', () => {
  const cruise = () => { const c = newCar(track, 50, 0); for (let i = 0; i < 400; i++) stepCar(c, GAS, DT, track); c.boostT = 0; return c; };
  it('shoves the car forward once when nitro ignites, not on every held frame', () => {
    const plain = cruise(), lit = cruise(); const before = lit.vf;
    stepCar(plain, GAS, DT, track); stepCar(lit, NITRO, DT, track);
    expect(lit.vf - plain.vf).toBeGreaterThan(NITRO_KICK * 0.8);
    const held = lit.vf; for (let i = 0; i < 30; i++) stepCar(lit, NITRO, DT, track);
    // 30 프레임 동안 계속 누르고 있어도 킥이 다시 들어가지 않는다(가속만): 프레임당 킥이었다면 +90 m/s 가 넘는다.
    expect(lit.vf - held).toBeLessThan(NITRO_KICK * 4); expect(before).toBeGreaterThan(20);
  });
  it('does not kick a parked car or a car that is not on the throttle', () => {
    const c = newCar(track, 50, 0); const v = c.vf; stepCar(c, NITRO, DT, track); expect(c.vf - v).toBeLessThan(NITRO_KICK);
    const coast = cruise(), ref = cruise(); stepCar(coast, { ...NITRO, throttle: 0 }, DT, track); stepCar(ref, { ...GAS, throttle: 0 }, DT, track);
    expect(Math.abs(coast.vf - ref.vf)).toBeLessThan(0.5);
  });
});

describe('SPEED RUSH has no pickup crates', () => {
  it('races have no items and emit no pickup events', () => {
    const r = createRace(track, 3, Infinity, {}); expect('items' in r).toBe(false);
    const types = new Set<string>(); for (let t = 0; t < COUNTDOWN + 4; t += DT) for (const e of updateRace(r, DT, GAS)) types.add(e.type);
    expect([...types].some(x => ['pickup', 'item', 'oilHit', 'shieldBlock'].includes(x))).toBe(false);
  });
});
