import { describe, expect, it } from 'vitest';
import { CARS, carParams } from '../../src/race/config';
import { UPGRADE_COST, UPGRADE_MAX, buyUpgrade, emptyGarage, nextCost, rewardFor, sanitizeGarage, upgradesOf } from '../../src/race/garage';
import { createRace } from '../../src/race/race';
import { buildMapTrack } from '../../src/race/track';
import { MAPS } from '../../src/race/maps';

describe('차고', () => {
  it('코인이 모자라면 살 수 없고 충분하면 차감된다', () => {
    expect(buyUpgrade(emptyGarage(), 'arc', 'top')).toBeNull();
    const g = buyUpgrade({ coins: 200, cars: {}, skins: [] }, 'arc', 'top')!;
    expect(g.coins).toBe(200 - UPGRADE_COST[0]); expect(upgradesOf(g, 'arc').top).toBe(1); expect(upgradesOf(g, 'bolt').top).toBe(0);
  });
  it('최대 단계 이후에는 살 수 없다', () => {
    let g = { coins: 99999, cars: {}, skins: [] } as ReturnType<typeof emptyGarage>;
    for (let i = 0; i < UPGRADE_MAX; i++) g = buyUpgrade(g, 'arc', 'accel')!;
    expect(nextCost(g, 'arc', 'accel')).toBeNull(); expect(buyUpgrade(g, 'arc', 'accel')).toBeNull();
  });
  it('알 수 없는 차량은 살 수 없다', () => { expect(buyUpgrade({ coins: 999, cars: {}, skins: [] }, 'nope', 'top')).toBeNull(); });
  it('보상은 순위·난이도·랩 수에 따라 늘어난다', () => {
    expect(rewardFor(1, 1, 3, false)).toBeGreaterThan(rewardFor(4, 1, 3, false));
    expect(rewardFor(1, 5, 3, false)).toBeGreaterThan(rewardFor(1, 1, 3, false));
    expect(rewardFor(1, 1, 3, false)).toBeGreaterThan(rewardFor(1, 1, 1, false));
    expect(rewardFor(2, 1, 3, true)).toBeGreaterThan(rewardFor(2, 1, 3, false));
  });
  it('깨진 저장값은 안전한 차고로 되돌린다', () => {
    expect(sanitizeGarage('x')).toEqual(emptyGarage());
    const g = sanitizeGarage({ coins: -5, cars: { arc: { top: 99, accel: 'a' }, ghost: { top: 1 } } });
    expect(g.coins).toBe(0); expect(upgradesOf(g, 'arc').top).toBe(UPGRADE_MAX); expect(upgradesOf(g, 'arc').accel).toBe(0); expect(g.cars.ghost).toBeUndefined();
  });
  it('업그레이드가 성능에 반영되고 온라인 대전·라이벌에는 쓰이지 않는다', () => {
    const arc = CARS[0], base = carParams(arc), up = carParams(arc, { top: 3, accel: 3 });
    expect(up.top).toBeGreaterThan(base.top); expect(up.accel).toBeGreaterThan(base.accel); expect(up.grip).toBe(base.grip);
    const t = buildMapTrack(MAPS[0]), solo = createRace(t, 1, Infinity, { car: 'arc', upgrades: { top: 3 } });
    expect(solo.player.params.top).toBeCloseTo(carParams(arc, { top: 3 }).top); expect(solo.racers[1].params.top).toBeCloseTo(carParams(CARS[1]).top);
    const pvp = createRace(t, 1, Infinity, { car: 'arc', upgrades: { top: 3 }, pvp: { host: true, opponent: 'x', opponentCar: 'bolt' } });
    expect(pvp.player.params.top).toBeCloseTo(base.top);
  });
});
