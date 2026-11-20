import { describe, expect, it } from 'vitest';
import { CARS, carParams } from '../../src/race/config';
import { emptyGarage, rewardFor, sanitizeGarage } from '../../src/race/garage';
import { createRace } from '../../src/race/race';
import { buildMapTrack } from '../../src/race/track';
import { MAPS } from '../../src/race/maps';

describe('외형 전용 차고', () => {
  it('보상은 순위·난이도·랩 수에 따라 늘어난다', () => {
    expect(rewardFor(1, 1, 3, false)).toBeGreaterThan(rewardFor(4, 1, 3, false));
    expect(rewardFor(1, 5, 3, false)).toBeGreaterThan(rewardFor(1, 1, 3, false));
    expect(rewardFor(1, 1, 3, false)).toBeGreaterThan(rewardFor(1, 1, 1, false));
    expect(rewardFor(2, 1, 3, true)).toBeGreaterThan(rewardFor(2, 1, 3, false));
  });
  it('이전 튜닝 저장값은 버리고 도장과 코인은 유지한다', () => {
    expect(sanitizeGarage('x')).toEqual(emptyGarage());
    expect(sanitizeGarage({ coins: 200, cars: { arc: { top: 3 } }, skins: ['night'] })).toEqual({ coins: 200, skins: ['night'] });
  });
  it('솔로와 온라인 모두 이전 튜닝 옵션을 무시한다', () => {
    const t = buildMapTrack(MAPS[0]), base = carParams(CARS[0]);
    const legacy = { car: 'arc', upgrades: { top: 3, accel: 3 } };
    const solo = createRace(t, 1, Infinity, legacy);
    const pvp = createRace(t, 1, Infinity, { ...legacy, pvp: { host: true, opponent: 'x', opponentCar: 'bolt' } });
    expect(solo.player.params.top).toBeCloseTo(base.top);
    expect(solo.player.params.accel).toBeCloseTo(base.accel);
    expect(pvp.player.params.top).toBeCloseTo(base.top);
  });
});
