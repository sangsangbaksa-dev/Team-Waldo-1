import { describe, expect, it } from 'vitest';
import { ARMORY_KEYS, buyArmory, edgeOf, emptyArmory, nextCost, rewardFor, sanitizeArmory } from '../../src/rts/armory';
import { START_MINERALS } from '../../src/rts/config';
import { NO_EDGE, RtsSim } from '../../src/rts/sim';
import { UPGRADE_COST, UPGRADE_MAX, buyTier, clampInt } from '../../src/shared/upgrades';

describe('공용 업그레이드 규칙', () => {
  it('단계 가격표를 따르고 최대 단계에서 멈춘다', () => {
    let lv = 0, coins = 10000; for (let i = 0; i < UPGRADE_MAX; i++) { const r = buyTier(coins, lv)!; expect(coins - r.coins).toBe(UPGRADE_COST[i]); coins = r.coins; lv = r.level; }
    expect(buyTier(coins, lv)).toBeNull(); expect(buyTier(0, 0)).toBeNull();
  });
  it('깨진 저장값은 0 으로 정리한다', () => { expect(clampInt(-4, 3)).toBe(0); expect(clampInt(NaN, 3)).toBe(0); expect(clampInt(99, 3)).toBe(3); expect(clampInt('x', 3)).toBe(0); });
});

describe('FRONTLINE 무기고', () => {
  it('코인이 모자라면 못 사고, 사면 코인이 줄고 단계가 오른다', () => {
    const a = emptyArmory(); expect(buyArmory(a, 'dmg')).toBeNull();
    const b = buyArmory({ ...a, coins: 200 }, 'dmg')!; expect(b.coins).toBe(200 - UPGRADE_COST[0]); expect(b.levels.dmg).toBe(1); expect(nextCost(b, 'dmg')).toBe(UPGRADE_COST[1]);
  });
  it('저장값이 깨져도 쓸 수 있는 무기고로 돌아온다', () => {
    expect(sanitizeArmory(null)).toEqual(emptyArmory()); const s = sanitizeArmory({ coins: 'a', levels: { dmg: 99, def: -1, speed: 2.7 } }); expect(s.levels).toEqual({ dmg: UPGRADE_MAX, def: 0, speed: 2, cash: 0 }); expect(s.coins).toBe(0);
  });
  it('보상은 승리 > 패배, 어려울수록 많다', () => {
    expect(rewardFor(true, 'normal', 300, 10)).toBeGreaterThan(rewardFor(false, 'normal', 300, 10)); expect(rewardFor(true, 'brutal', 300, 10)).toBeGreaterThan(rewardFor(true, 'easy', 300, 10)); expect(rewardFor(false, 'easy', 0, 0)).toBeGreaterThan(0);
  });
  it('시뮬레이션이 배율을 반영한다: 시작 광물·받는 피해', () => {
    const max = { coins: 0, levels: Object.fromEntries(ARMORY_KEYS.map(k => [k, UPGRADE_MAX])) as ReturnType<typeof emptyArmory>['levels'] }, e = edgeOf(max);
    expect(e.minerals).toBe(180); expect(e.dmg).toBeCloseTo(1.18); expect(e.def).toBeCloseTo(0.85);
    const s = new RtsSim({ edge: [e, NO_EDGE] }); s.record = false; expect(s.players[0].minerals).toBe(START_MINERALS + 180); expect(s.players[1].minerals).toBe(START_MINERALS);
  });
});
