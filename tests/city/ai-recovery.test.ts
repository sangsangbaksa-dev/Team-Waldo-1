import { describe, expect, it } from 'vitest';
import { attackStalled, thinkFaction, type AiState } from '../../src/city/ai';
import { World } from '../../src/city/world';

const state = (): AiState => ({
  goal: 'idle', tx: 0, ty: 0, biz: 0, t: 0, attackT: 0, stuckT: 0,
});

describe('LAST CITY rival combat recovery', () => {
  it('does not abandon an attack that is making progress', () => {
    const ai = state();
    expect(attackStalled(ai, 0, 1200, 1200, 900, false)).toBe(false);
    ai.goal = 'attack'; ai.tx = 1200; ai.ty = 1200;
    expect(attackStalled(ai, 105, 1200, 1200, 840, false)).toBe(false);
    expect(ai.stuckT).toBe(105);
    expect(attackStalled(ai, 210, 1200, 1200, 830, false)).toBe(false);
    expect(attackStalled(ai, 216, 1200, 1200, 830, false)).toBe(true);
  });

  it('resets its stall timer when the target moves, and never times out a final battle', () => {
    const ai = state();
    ai.goal = 'attack'; ai.tx = 100; ai.ty = 100; ai.attackDist = 1000;
    expect(attackStalled(ai, 400, 500, 500, 900, false)).toBe(false);
    expect(ai.stuckT).toBe(400);
    ai.tx = 500; ai.ty = 500;
    expect(attackStalled(ai, 600, 500, 500, 900, true)).toBe(false);
    expect(attackStalled(ai, 601, 500, 500, 200, false)).toBe(false);
  });

  it('uses an existing medkit at critical health, without creating extra kits', () => {
    const w = new World({ seed: 21, difficulty: 'd4', klass: 'engineer' });
    const f = w.factions[1], boss = w.boss(1)!;
    f.medkits = 1;
    boss.hp = boss.maxHp * 0.25;
    const before = boss.hp;
    thinkFaction(w, f);
    expect(f.medkits).toBe(0);
    expect(boss.hp).toBe(Math.min(boss.maxHp, before + 70));
    thinkFaction(w, f);
    expect(f.medkits).toBe(0);
  });
});
