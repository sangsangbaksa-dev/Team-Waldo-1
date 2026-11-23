import { describe, expect, it } from 'vitest';
import { advanceSkyQualityRecovery } from '../../src/sky/quality';

describe('SKY WAR 적응형 화질 복구', () => {
  it('지속적인 60fps가 확보되면 낮춰 둔 화질을 한 단계 복구한다', () => {
    let stable = 0, restored = 0;
    for (let i = 0; i < 60 * 16; i++) {
      const q = advanceSkyQualityRecovery(stable, 1000 / 60, 1 / 60, 2 - restored);
      stable = q.stableSeconds;
      if (q.restore) restored++;
    }
    expect(restored).toBe(1);
  });

  it('낮은 프레임 속도에서는 화질을 성급하게 복구하지 않는다', () => {
    let stable = 0;
    for (let i = 0; i < 30 * 60; i++) {
      const q = advanceSkyQualityRecovery(stable, 1000 / 30, 1 / 30, 3);
      stable = q.stableSeconds;
      expect(q.restore).toBe(false);
    }
    expect(stable).toBe(0);
  });

  it('간헐적 버벅임에는 누적 회복 시간이 감소한다', () => {
    const q = advanceSkyQualityRecovery(10, 32, 0.05, 1);
    expect(q.stableSeconds).toBeCloseTo(9.8, 6);
    expect(q.restore).toBe(false);
  });

  it('화질이 최대면 회복 카운터를 즉시 정리한다', () => {
    expect(advanceSkyQualityRecovery(14.8, 16, 0.05, 0)).toEqual({ stableSeconds: 0, restore: false });
  });
});
