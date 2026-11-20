import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shooter/sim';
import { WEAPONS } from '../../src/shooter/config';

function setup() {
  const m = new Match({ seed: 73, mode: 'duel', difficulty: 'normal', humans: [{ name: 'A' }, { name: 'B' }] });
  m.loot = [];
  const p = m.players[0];
  p.guns = [{ id: 'pistol', mag: 10, reserve: 36, att: {} }, { id: 'rifle', mag: 20, reserve: 60, att: {} }];
  p.cur = 0;
  return { m, p };
}

describe('weapon switch and reload', () => {
  it('uses the newly equipped weapon reload duration and capacity', () => {
    const { m, p } = setup();
    p.input.slot = 1;
    p.input.reload = true;
    m.step(1 / 60);
    expect(p.cur).toBe(1);
    expect(p.reload).toBeCloseTo(WEAPONS.rifle.reload, 6);
    p.input.reload = false;
    for (let i = 0; i < 130; i++) m.step(1 / 60);
    expect(p.guns[1]?.mag).toBe(30);
    expect(p.guns[1]?.reserve).toBe(50);
    expect(p.guns[0]?.mag).toBe(10);
  });

  it('consumes a switch request for an empty slot', () => {
    const { m, p } = setup();
    p.guns[1] = null;
    p.input.slot = 1;
    m.step(1 / 60);
    expect(p.cur).toBe(0);
    expect(p.input.slot).toBe(-1);
  });

  it('does not subtract loaded rounds when finishing a reload above capacity', () => {
    const { m, p } = setup();
    p.guns[0]!.mag = 15;
    p.reload = 0.001;
    m.step(1 / 60);
    expect(p.guns[0]?.mag).toBe(15);
    expect(p.guns[0]?.reserve).toBe(36);
  });
});
