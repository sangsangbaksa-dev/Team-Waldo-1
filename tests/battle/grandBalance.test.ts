import { describe, expect, it } from 'vitest';
import { combatDifficultyMultiplier, createWar, getIncome, stepWar, stormStartFor, DIFFICULTIES } from '../../src/battle/war';

describe('100 vs 500 balance regression', () => {
  it.each(['easy', 'normal', 'hard'] as const)('%s starts with the full 600-unit army, never a reduced battle', difficulty => {
    const w = createWar({ grandBattle: true, difficulty });
    expect([0, 1, 2, 3].map(id => w.units.filter(u => u.owner === id).length)).toEqual([100, 167, 167, 166]);
    expect(w.factions[0].gold).toBe(9000);
    expect(w.factions[0].food).toBe(8000);
    expect(w.factions.slice(1).every(f => f.hp === 600)).toBe(true);
    expect(w.factions[0].hp).toBe(600);
    expect(w.units.every(u => Number.isFinite(u.x) && Number.isFinite(u.z))).toBe(true);
  });

  it('provides staged AI sieges and a storm warning window according to difficulty', () => {
    expect(DIFFICULTIES.easy.aiAttackAfter).toBe(350);
    expect(DIFFICULTIES.normal.aiAttackAfter).toBe(180);
    expect(DIFFICULTIES.hard.aiAttackAfter).toBe(0);
    expect(stormStartFor(createWar({ grandBattle: true, difficulty: 'easy' }))).toBe(420);
    expect(stormStartFor(createWar({ grandBattle: true, difficulty: 'normal' }))).toBe(330);
    expect(stormStartFor(createWar({ grandBattle: true, difficulty: 'hard' }))).toBe(270);
  });

  it('helps the outnumbered army without strengthening enemies against enemies', () => {
    const easy = createWar({ grandBattle: true, difficulty: 'easy' });
    const normal = createWar({ grandBattle: true });
    const hard = createWar({ grandBattle: true, difficulty: 'hard' });
    expect(combatDifficultyMultiplier(easy, 0, 1)).toBe(1.45);
    expect(combatDifficultyMultiplier(easy, 1, 0)).toBe(.55);
    expect(combatDifficultyMultiplier(easy, 1, 2)).toBe(1);
    expect(combatDifficultyMultiplier(normal, 0, 1)).toBe(1.15);
    expect(combatDifficultyMultiplier(normal, 1, 0)).toBe(.9);
    expect(combatDifficultyMultiplier(hard, 0, 1)).toBe(1);
    expect(combatDifficultyMultiplier(hard, 1, 0)).toBe(1);
    expect(getIncome(easy, 1).gold).toBeLessThan(getIncome(normal, 1).gold);
  });

  it('applies combat assistance to real symmetric unit encounters deterministically', () => {
    function duel(difficulty: 'easy' | 'normal' | 'hard') {
      const w=createWar({grandBattle:true,difficulty});
      for(const faction of w.factions) faction.aiTimer=99999;
      const ally=w.units.find(u=>u.owner===0 && u.kind==='infantry')!;
      const enemy=w.units.find(u=>u.owner===1 && u.kind==='infantry')!;
      ally.x=0;ally.z=0;enemy.x=0;enemy.z=2;
      w.units=[ally,enemy];
      const before=[ally.hp,enemy.hp];
      stepWar(w,.025);
      return {received:before[0]-ally.hp,dealt:before[1]-enemy.hp};
    }
    const easy=duel('easy'),normal=duel('normal'),hard=duel('hard');
    expect(easy.dealt).toBeGreaterThan(normal.dealt);
    expect(normal.dealt).toBeGreaterThan(hard.dealt);
    expect(easy.received).toBeLessThan(normal.received);
    expect(normal.received).toBeLessThan(hard.received);
  });
});
