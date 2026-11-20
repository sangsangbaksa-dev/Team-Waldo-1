import { describe, expect, it } from 'vitest';
import { Match } from './sim';
import { WEAPONS } from './config';

function fixture() {
  const match = new Match({ seed: 42, mode: 'duel', difficulty: 'normal', humans: [{ name: 'A' }, { name: 'B' }] });
  match.loot = [];
  const player = match.players[0];
  player.guns[1] = { id: 'rifle', mag: 3, reserve: 50, att: {} };
  return { match, player };
}

describe('weapon slot changes', () => {
  it('uses the newly equipped weapon reload duration', () => {
    const { match, player } = fixture();
    player.input.slot = 1;
    player.input.reload = true;
    match.step(1 / 60);
    expect(player.cur).toBe(1);
    expect(player.reload).toBeCloseTo(WEAPONS.rifle.reload);
    player.input.reload = false;
    for (let i = 0; i < 130; i++) match.step(1 / 60);
    expect(player.guns[1]?.mag).toBe(WEAPONS.rifle.mag);
    expect(player.guns[1]?.reserve).toBe(50 - (WEAPONS.rifle.mag - 3));
  });

  it('can immediately reload after switching from an empty slot', () => {
    const { match, player } = fixture();
    player.guns[0] = null;
    player.input.slot = 1;
    player.input.reload = true;
    match.step(1 / 60);
    expect(player.cur).toBe(1);
    expect(player.reload).toBeCloseTo(WEAPONS.rifle.reload);
  });

  it('does not remove ammo from an already full magazine', () => {
    const { match, player } = fixture();
    player.cur = 1;
    const gun = player.guns[1]!;
    gun.mag = WEAPONS.rifle.mag + 1;
    player.reload = 0.01;
    match.step(1 / 60);
    expect(gun.mag).toBe(WEAPONS.rifle.mag + 1);
    expect(gun.reserve).toBe(50);
  });
});
