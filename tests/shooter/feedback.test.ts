import { describe, expect, it } from 'vitest';
import { damageLabel, markerHold, nextCombo, rollupHits } from '../../src/shooter/domain/feedback';

describe('ZERO ZONE 타격 표시', () => {
  it('같은 대상의 펠릿은 한 숫자로 합치고 머리 명중을 남긴다', () => {
    const rolls = rollupHits([
      { victim: 3, dmg: 11, head: false },
      { victim: 3, dmg: 11, head: true },
      { victim: 4, dmg: 14, head: false },
      { victim: -1, dmg: 20, head: false },
    ]);
    expect(rolls).toEqual([
      { victim: 3, dmg: 22, head: true },
      { victim: 4, dmg: 14, head: false },
    ]);
  });
  it('연속 명중은 6에서 멈추고, 숫자는 피해와 연속만 보여 준다', () => {
    expect(nextCombo(5, 2)).toBe(6);
    expect(nextCombo(2, 0)).toBe(2);
    expect(damageLabel(25.6, 1)).toBe('26');
    expect(damageLabel(40, 3)).toBe('40 ×3');
  });
  it('머리와 처치 표식은 몸통보다 오래 남는다', () => {
    expect(markerHold(false, false)).toBeLessThan(markerHold(true, false));
    expect(markerHold(true, false)).toBeLessThan(markerHold(false, true));
  });
});
