import { describe, expect, it } from 'vitest';
import { createWar, DIFFICULTIES, order, stepWar, train, type Difficulty } from '../../src/battle/war';

function stagedArmy(difficulty: Difficulty, faction: number, allOutposts: boolean) {
  const world = createWar({ difficulty });
  for (const side of world.factions) side.aiTimer = 9999;
  const ai = world.factions[faction]; ai.gold = 10000; ai.food = 10000; ai.aiTimer = 0;
  const size = allOutposts ? 8 : 12;
  for (let i = 4; i < size; i++) train(world, faction);
  for (const post of world.outposts.slice(0, allOutposts ? 9 : 3)) post.owner = faction;
  return { world, ai };
}

describe('disclosed AI siege preparation', () => {
  it.each(['easy', 'normal'] as Difficulty[])('stages every %s opponent before its advertised HQ offensive time', difficulty => {
    for (const faction of [1, 2, 3]) for (const allOutposts of [false, true]) {
      const { world, ai } = stagedArmy(difficulty, faction, allOutposts);
      world.time = DIFFICULTIES[difficulty].aiAttackAfter - 1;
      // Old saves may contain an already queued order; the next AI decision must respect staging.
      ai.target = faction === 1 ? 0 : 1;
      stepWar(world, .05);
      expect(ai.target).toBeNull();
      expect(allOutposts ? ai.rally === null : ai.rally !== null).toBe(true);
      expect(world.factions[0].hp).toBe(400);
    }
  });

  it.each(['easy', 'normal'] as Difficulty[])('allows both %s HQ-target branches after preparation', difficulty => {
    for (const faction of [1, 2, 3]) for (const allOutposts of [false, true]) {
      const { world, ai } = stagedArmy(difficulty, faction, allOutposts);
      world.time = DIFFICULTIES[difficulty].aiAttackAfter;
      stepWar(world, .05);
      expect(ai.target).not.toBeNull();
      expect(ai.target).not.toBe(faction);
      expect(ai.rally).toBeNull();
    }
  });

  it('retains immediate hard-mode strategic targeting without changing starting resources', () => {
    expect(DIFFICULTIES.hard.aiAttackAfter).toBe(0);
    for (const faction of [1, 2, 3]) for (const allOutposts of [false, true]) {
      const { world, ai } = stagedArmy('hard', faction, allOutposts);
      stepWar(world, .05);
      expect(ai.target).not.toBeNull();
    }
    for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
      const world = createWar({ difficulty });
      expect(world.factions.every(side => side.gold === 140 && side.food === 100 && side.hp === 400)).toBe(true);
    }
  });

  it('keeps player attacks and ordinary damage active during AI staging', () => {
    const world = createWar({ difficulty: 'easy' });
    for (const side of world.factions) side.aiTimer = 9999;
    const enemy = world.factions[1];
    world.units = world.units.filter(unit => unit.owner === 0);
    for (const unit of world.units) { unit.x = enemy.x; unit.z = enemy.z; }
    expect(order(world, 0, 1)).toBe(true);
    stepWar(world, .05);
    expect(world.time).toBeLessThan(DIFFICULTIES.easy.aiAttackAfter);
    expect(enemy.hp).toBeLessThan(400);
    expect(world.units.some(unit => unit.hp < 52)).toBe(true);
  });
});
