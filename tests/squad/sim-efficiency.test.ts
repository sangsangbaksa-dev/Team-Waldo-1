import { describe, expect, it } from 'vitest';
import { Battle, STEP, type Effect } from '../../src/squad/sim';

const makeBattle = () => new Battle(
  [{ type: 'guard', x: 4, y: 11 }, { type: 'archer', x: 6, y: 13 }],
  [{ type: 'guard', x: 4, y: 8 }, { type: 'striker', x: 6, y: 7 }],
  42,
);

describe('Squad simulation effect lifecycle', () => {
  it('removes expired visual effects without replacing the effects array', () => {
    const battle = makeBattle();
    const original = battle.effects;
    const stale: Effect = {
      x: 2, y: 2, x2: 3, y2: 3, value: 10, side: 0,
      kind: 'hit', age: 0.7 - STEP / 2,
    };
    battle.effects.push(stale);
    battle.step();
    expect(battle.effects).toBe(original);
    expect(battle.effects).not.toContain(stale);
    for (let i = 0; i < 60 && battle.winner === null; i++) {
      battle.step();
      expect(battle.effects).toBe(original);
      expect(battle.effects.every(effect => effect.age >= 0 && effect.age < 0.7)).toBe(true);
    }
  });

  it('maintains deterministic unit positions and outcomes across multiple seeds', () => {
    for (const seed of [0, 1, 11, 12345, 0xffffffff]) {
      const first = makeBattle(), second = makeBattle();
      first.seed = seed; second.seed = seed;
      for (let i = 0; i < 180 && first.winner === null; i++) {
        first.step(); second.step();
      }
      expect(second.units).toEqual(first.units);
      expect(second.effects).toEqual(first.effects);
      expect(second.winner).toBe(first.winner);
    }
  });
});
