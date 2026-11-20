import { describe, expect, it } from 'vitest';
import { dailyChallenge } from '../../src/daily-challenge';
describe('daily challenge', () => {
  it('rotates through all seven games, keeping a single day stable', () => {
    const games = Array.from({ length: 7 }, (_, i) => dailyChallenge(new Date(2026, 10, 20 + i)).game);
    expect(new Set(games).size).toBe(7);
    expect(dailyChallenge(new Date(2026, 10, 20, 23))).toEqual(dailyChallenge(new Date(2026, 10, 20, 0)));
  });
  it('has a safe fallback for invalid dates', () => expect(dailyChallenge(new Date(NaN)).game).toBe('city'));
});
