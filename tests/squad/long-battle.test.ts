import { describe, expect, it } from 'vitest';
import { autoArmy, buildArmy } from '../../src/squad/ai';
import { Battle, validArmy, type Side } from '../../src/squad/sim';
import { UNITS } from '../../src/squad/units';

describe('SQUAD CLASH long-battle invariants', () => {
  it('keeps every soldier finite, inside the field, and resolves every budget-legal AI matchup', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      for (const side of [0, 1] as Side[]) {
        const mine = autoArmy(side);
        const theirs = buildArmy((1 - side) as Side, difficulty, mine);
        expect(validArmy(mine, side)).toBe(true);
        expect(validArmy(theirs, (1 - side) as Side)).toBe(true);
        for (const seed of [1, 17, 98765]) {
          const battle = side === 0 ? new Battle(mine, theirs, seed) : new Battle(theirs, mine, seed);
          while (battle.winner === null) {
            battle.step();
            for (const u of battle.units) {
              expect(Number.isFinite(u.x) && Number.isFinite(u.y)).toBe(true);
              expect(u.x).toBeGreaterThanOrEqual(0.3);
              expect(u.x).toBeLessThanOrEqual(11.7);
              expect(u.y).toBeGreaterThanOrEqual(0.3);
              expect(u.y).toBeLessThanOrEqual(19.7);
              expect(Number.isFinite(u.hp) && Number.isFinite(u.damage)).toBe(true);
              expect(u.hp).toBeLessThanOrEqual(UNITS[u.type].hp);
              expect(u.damage).toBeGreaterThanOrEqual(0);
            }
            expect(battle.tick).toBeLessThanOrEqual(1800);
          }
          expect([0, 1, 'draw']).toContain(battle.winner);
        }
      }
    }
  });
});
