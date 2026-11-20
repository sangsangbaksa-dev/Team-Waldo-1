import { describe, expect, it } from 'vitest';
import { Match } from './sim';
import { WEAPONS } from './config';

function fixture() {
  const match = new Match({ seed: 37, mode: 'duel', difficulty: 'normal', humans: [{ name: 'Human' }], fill: 2 });
  match.loot = [];
  const bot = match.players[1];
  bot.brain = null; // Supply deterministic decisions directly to the simulation.
  return { match, bot, human: match.players[0] };
}

describe('ZERO ZONE bot combat', () => {
  it('can repeatedly fire a semi-auto weapon while engaging', () => {
    const { match, bot } = fixture();
    bot.cd = 0;
    bot.input.fire = true;
    bot.input.pitch = 1.4;
    for (let i = 0; i < 40; i++) match.step(1 / 60);
    expect(bot.guns[0]!.mag).toBeLessThan(WEAPONS.pistol.mag - 1);
  });

  it('does not make a held semi-auto trigger automatic for humans', () => {
    const { match, human } = fixture();
    human.cd = 0;
    human.input.fire = true;
    human.input.pitch = 1.4;
    for (let i = 0; i < 40; i++) match.step(1 / 60);
    expect(human.guns[0]!.mag).toBe(WEAPONS.pistol.mag - 1);
  });

  it('replaces the weaker slot rather than dropping the equipped sniper', () => {
    const { match, bot } = fixture();
    bot.guns[0] = { id: 'sniper', mag: 5, reserve: 10, att: {} };
    bot.guns[1] = { id: 'pistol', mag: 12, reserve: 24, att: {} };
    bot.input.interact = true;
    match.loot.push({ id: 999, kind: 'weapon', weapon: 'rifle', x: bot.x, z: bot.z, taken: false });
    match.step(1 / 60);
    expect(bot.guns[0]?.id).toBe('sniper');
    expect(bot.guns[1]?.id).toBe('rifle');
    expect(bot.cur).toBe(1);
  });
});
