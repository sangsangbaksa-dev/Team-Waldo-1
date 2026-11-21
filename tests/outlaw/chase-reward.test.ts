import { describe, expect, it } from 'vitest';
import { chaseEscapeReward } from '../../src/outlaw/police';

describe('추격 보상', () => {
  it('최고 수배 단계에 비례하며 5단계에서 제한된다', () => {
    expect(chaseEscapeReward(0)).toBe(0);
    expect(chaseEscapeReward(1)).toBe(150);
    expect(chaseEscapeReward(3)).toBe(450);
    expect(chaseEscapeReward(8)).toBe(750);
  });
});
