import { describe, expect, it } from 'vitest';
import { playerHitCue, stackDamage, threatWash } from '../../src/city/domain/feedback';

describe('LAST CITY 타격 표시', () => {
  it('플레이어 명중은 짧게, 처치는 더 길게 남긴다', () => {
    expect(playerHitCue(false, false).seconds).toBe(0);
    expect(playerHitCue(true, false)).toEqual({ seconds: 0.22, kill: false });
    expect(playerHitCue(true, true).seconds).toBeGreaterThan(0.3);
  });
  it('짧은 간격의 피해는 합산하고, 창이 지나면 새로 센다', () => {
    const first = stackDamage(null, 12.2, 1);
    const second = stackDamage(first, 7.1, 1.2);
    expect(second.label).toBe('−20');
    const later = stackDamage(second, 4, 1.2 + 0.5);
    expect(later.label).toBe('−4');
  });
  it('구역 밖 경고는 화면을 붉은 막으로 덮지 않는다', () => {
    const outside = threatWash(0, 0, true);
    expect(outside.storm).toBe(true);
    expect(outside.opacity).toBeLessThan(0.3);
    expect(threatWash(1, 0, false).opacity).toBeLessThanOrEqual(0.72);
    expect(threatWash(0, 0, false)).toEqual({ opacity: 0, storm: false });
  });
});
