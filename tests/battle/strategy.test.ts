import { describe, expect, it } from 'vitest';
import { captureOrder, createWar, order, stepWar, train, upgrade, MAX_UNITS } from '../../src/battle/war';

describe('3D management war strategic rules', () => {
 it('starts with four living factions, five neutral objectives, and four squads of recruits', () => {
  const w=createWar();
  expect(w.factions).toHaveLength(4);
  expect(w.units).toHaveLength(16);
  expect(w.outposts).toHaveLength(5);
  expect(w.outposts.every(p=>p.owner===null)).toBe(true);
 });
 it('cannot recruit advanced units without researching the barracks', () => {
  const w=createWar(),f=w.factions[0];
  expect(train(w,0,'archer')).toBe(false);
  expect(train(w,0,'guardian')).toBe(false);
  f.gold=1000;f.food=1000;
  expect(upgrade(w,0,'barracks')).toBe(true);
  expect(train(w,0,'archer')).toBe(true);
  expect(train(w,0,'guardian')).toBe(false);
  expect(upgrade(w,0,'barracks')).toBe(true);
  expect(train(w,0,'guardian')).toBe(true);
 });
 it('enforces a hard army cap', () => {
  const w=createWar(),f=w.factions[0];f.gold=2000;f.food=2000;
  for(let i=0;i<MAX_UNITS+5;i++)train(w,0);
  expect(w.units.filter(u=>u.owner===0)).toHaveLength(MAX_UNITS);
 });
 it('captures a neutral outpost with uncontested presence and yields recurring income', () => {
  const w=createWar(),p=w.outposts[4],f=w.factions[0];
  for(const opponent of w.factions.slice(1)) opponent.aiTimer=10000;
  w.units=w.units.filter(u=>u.owner===0);
  for(const u of w.units){u.x=p.x;u.z=p.z;}
  expect(captureOrder(w,0,4)).toBe(true);
  expect(f.rally).toBe(4);
  expect(f.target).toBeNull();
  for(let i=0;i<250;i++)stepWar(w,.05);
  expect(p.owner).toBe(0);
  const money=f.gold;stepWar(w,.1);
  expect(f.gold-money).toBeCloseTo((f.mine*1.5+1.15)*.1);
 });
 it('blocks capture orders for dead factions and invalid outposts', () => {
  const w=createWar();
  expect(captureOrder(w,0,100)).toBe(false);
  w.factions[0].alive=false;
  expect(captureOrder(w,0,0)).toBe(false);
 });
 it('clears rally when a direct attack is ordered', () => {
  const w=createWar();
  captureOrder(w,0,1);
  expect(order(w,0,1)).toBe(true);
  expect(w.factions[0].rally).toBeNull();
  expect(w.factions[0].target).toBe(1);
 });
 it('fort upgrades increase base HP and towers hit nearby invaders', () => {
  const w=createWar(),f=w.factions[0],invader=w.units.find(u=>u.owner===1)!;
  f.gold=1000;f.food=1000;
  expect(upgrade(w,0,'fort')).toBe(true);
  expect(f.maxHp).toBe(500);
  invader.x=f.x;invader.z=f.z;const hp=invader.hp;
  stepWar(w,.05);
  expect(invader.hp).toBeLessThan(hp);
 });
 it('simulates strictly finite, nonnegative time increments', () => {
  const w=createWar();
  stepWar(w,Number.NaN);stepWar(w,-1);stepWar(w,0);
  expect(w.time).toBe(0);
  stepWar(w,999);
  expect(w.time).toBeCloseTo(.1);
 });
});
