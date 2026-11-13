import { describe, expect, it } from 'vitest';
import { getBaseState } from '../../src/battle/base';
import { interiorOption, performInteriorAction } from '../../src/battle/interiorActions';
import { decodeWar, encodeWar } from '../../src/battle/save';
import { createWar, getIncome } from '../../src/battle/war';

describe('enterable building interiors', () => {
  it('expands a visited mine using exactly the existing building economy and persists it', () => {
    const war = createWar();
    const before = getIncome(war, 0).gold;
    expect(interiorOption(war, 'mine', 'upgrade')).toMatchObject({
      enabled: true, price: '금 60 · 식량 20',
    });
    expect(performInteriorAction(war, 'mine', 'upgrade')).toBe(true);
    expect(war.factions[0].gold).toBe(80);
    expect(war.factions[0].food).toBe(80);
    expect(war.factions[0].mine).toBe(2);
    expect(getIncome(war, 0).gold).toBeCloseTo(before + 1.5);
    expect(getBaseState(war).structures.filter(s => s.kind === 'mine')).toHaveLength(2);
    expect(decodeWar(encodeWar(war))).toEqual(war);
  });

  it('performs meaningful but non-arbitrage mine and farm exchange orders', () => {
    const war = createWar(), f = war.factions[0];
    expect(performInteriorAction(war, 'mine', 'service')).toBe(true);
    expect(f.gold).toBe(195);
    expect(f.food).toBe(20);
    const before = encodeWar(war);
    expect(performInteriorAction(war, 'mine', 'service')).toBe(false);
    expect(encodeWar(war)).toBe(before);
    expect(performInteriorAction(war, 'farm', 'service')).toBe(true);
    expect(f.gold).toBe(115);
    expect(f.food).toBe(75);
    expect(performInteriorAction(war, 'farm', 'special')).toBe(true);
    expect(f.policy).toBe('growth');
    expect(interiorOption(war, 'farm', 'special')?.enabled).toBe(false);
    expect(decodeWar(encodeWar(war))).toEqual(war);
  });

  it('trains troops, unlocks tactical research, and honors the army cap', () => {
    const war = createWar(), f = war.factions[0];
    f.gold = 2000; f.food = 2000;
    expect(performInteriorAction(war, 'barracks', 'special')).toBe(false);
    expect(performInteriorAction(war, 'barracks', 'upgrade')).toBe(true);
    expect(performInteriorAction(war, 'barracks', 'special')).toBe(true);
    expect(f.research.weapons).toBe(1);
    expect(performInteriorAction(war, 'barracks', 'service')).toBe(true);
    expect(war.units.filter(u => u.owner === 0)).toHaveLength(7);
    expect(war.stats[0].trained).toBe(3);
    expect(decodeWar(encodeWar(war))).toEqual(war);
    const grand = createWar({grandBattle:true});
    grand.factions[0].gold = 100000;
    grand.factions[0].food = 100000;
    expect(performInteriorAction(grand, 'barracks', 'service')).toBe(true);
    expect(grand.units.filter(u=>u.owner===0)).toHaveLength(125);
    expect(decodeWar(encodeWar(grand))).toEqual(grand);
  });

  it('repairs fortifications, summons home guards and refuses actions on a defeated kingdom', () => {
    const war = createWar(), f = war.factions[0];
    f.hp = 260;
    expect(performInteriorAction(war, 'fort', 'service')).toBe(true);
    expect(f.hp).toBe(360);
    expect(performInteriorAction(war, 'fort', 'special')).toBe(true);
    expect(f.reserve).toBe(2);
    const before = encodeWar(war);
    expect(performInteriorAction(war, 'fort', 'special')).toBe(false);
    expect(encodeWar(war)).toBe(before);
    f.alive = false; f.hp = 0; f.target=null;f.rally=null;
    expect(interiorOption(war,'mine','upgrade')?.enabled).toBe(false);
    expect(performInteriorAction(war,'mine','upgrade')).toBe(false);
  });

  it('rejects out-of-range commands without mutating resources or save state', () => {
    const war = createWar();
    const before = encodeWar(war);
    expect(performInteriorAction(war, 'factory' as never, 'upgrade')).toBe(false);
    expect(performInteriorAction(war, 'mine', 'unspecified' as never)).toBe(false);
    expect(encodeWar(war)).toBe(before);
  });
});

describe('interiors share campaign storage and queued supply',()=>{
 it('caps exchange receipts and refuses to spend when the receiving warehouse is full',()=>{
  const w=createWar({economyCampaign:true}),f=w.factions[0];f.gold=1190;f.food=100;
  expect(interiorOption(w,'mine','service')?.price).toContain('10');
  expect(performInteriorAction(w,'mine','service')).toBe(true);expect(f.gold).toBe(1200);expect(f.food).toBe(20);
  f.food=100;const saved=encodeWar(w);expect(performInteriorAction(w,'mine','service')).toBe(false);expect(encodeWar(w)).toBe(saved);
 });
 it('uses the same training queue and reserves pending troops in the barracks interior',()=>{
  const w=createWar({economyCampaign:true});w.factions[0].gold=1000;w.factions[0].food=1000;
  for(let i=0;i<4;i++)expect(performInteriorAction(w,'barracks','service')).toBe(true);
  expect(w.units.filter(u=>u.owner===0)).toHaveLength(4);
  expect(interiorOption(w,'barracks','service')?.enabled).toBe(false);
  expect(w.recruitment[0].queue.reduce((sum,item)=>sum+item.amount,0)).toBe(12);
  expect(decodeWar(encodeWar(w))).toEqual(w);
 });
});
