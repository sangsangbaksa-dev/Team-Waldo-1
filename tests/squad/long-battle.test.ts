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
              if (!Number.isFinite(u.x) || !Number.isFinite(u.y) ||
                  u.x < 0.3 || u.x > 11.7 || u.y < 0.3 || u.y > 19.7 ||
                  !Number.isFinite(u.hp) || !Number.isFinite(u.damage) ||
                  u.hp > UNITS[u.type].hp || u.damage < 0) {
                throw new Error(`Invalid soldier state in round ${seed}, tick ${battle.tick}: ${JSON.stringify(u)}`);
              }
            }
            if (battle.tick > 1800) throw new Error('The round never resolved');
          }
          expect([0, 1, 'draw']).toContain(battle.winner);
        }
      }
    }
  });
});
