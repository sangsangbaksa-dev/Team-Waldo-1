import { describe, expect, it } from 'vitest';
import { beamClearance } from '../../src/outlaw/actorview';

describe('표식 빔 페이드', () => {
  it('빔 벽에 바짝 붙으면 화면을 덮지 않도록 완전히 걷는다', () => {
    expect(beamClearance(2.2, 1.75)).toBe(0);
    expect(beamClearance(0, 3)).toBe(0);
  });
  it('멀어질수록 서서히 보이다가 14m 이상이면 그대로 보인다', () => {
    expect(beamClearance(8, 1.75)).toBeGreaterThan(0);
    expect(beamClearance(8, 1.75)).toBeLessThan(1);
    expect(beamClearance(40, 1.75)).toBe(1);
  });
});
