import { describe, expect, it } from 'vitest';
import { captureOrder, createWar, order, repair, setPolicy, setReserve, stepWar, train, trainSquad, upgrade, OUTPOST_BONUSES, MAP_HALF_SIZE, MAX_UNITS } from '../../src/battle/war';

describe('3D management war strategic rules', () => {
 it('starts with four living factions, nine neutral objectives, and four squads of recruits', () => {
  const w=createWar();
  expect(w.factions).toHaveLength(4);
  expect(w.units).toHaveLength(16);
  expect(w.outposts).toHaveLength(9);
  expect(MAP_HALF_SIZE).toBe(185);
  expect(w.factions[0].x).toBe(-112);
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
 it('repairs damaged HQ without wasting resources at full HP',()=>{
  const w=createWar(),f=w.factions[0];
  expect(repair(w,0)).toBe(false);
  f.hp=250;
  const gold=f.gold,food=f.food;
  expect(repair(w,0)).toBe(true);
  expect(f.hp).toBe(350);
  expect(f.gold).toBe(gold-45);
  expect(f.food).toBe(food-25);
  f.gold=0;
  expect(repair(w,0)).toBe(false);
 });
 it('trains squads only when whole squad is affordable and within cap',()=>{
  const w=createWar(),f=w.factions[0];
  f.gold=2000;f.food=2000;
  expect(trainSquad(w,0,'infantry',3)).toBe(true);
  expect(w.units.filter(u=>u.owner===0)).toHaveLength(7);
  expect(trainSquad(w,0,'archer',3)).toBe(false);
  expect(trainSquad(w,0,'infantry',0)).toBe(false);
  expect(trainSquad(w,0,'infantry',6)).toBe(false);
  for(let i=0;i<11;i++)train(w,0);
  expect(trainSquad(w,0,'infantry',3)).toBe(false);
  expect(w.units.filter(u=>u.owner===0)).toHaveLength(MAX_UNITS);
 });
 it('keeps the storm wide enough for early expansion, then shrinks it',()=>{
  const w=createWar();expect(w.zone).toBe(179);
  w.time=100;stepWar(w,.1);expect(w.zone).toBe(179);
  w.time=300;stepWar(w,.1);expect(w.zone).toBeLessThan(110);
 });
 it('simulates strictly finite, nonnegative time increments', () => {
  const w=createWar();
  stepWar(w,Number.NaN);stepWar(w,-1);stepWar(w,0);
  expect(w.time).toBe(0);
  stepWar(w,999);
  expect(w.time).toBeCloseTo(.1);
 });
 it('lets the player switch between economic policies with distinct yields',()=>{
  const regular=createWar(),rapid=createWar(),military=createWar();
  expect(setPolicy(rapid,0,'growth')).toBe(true);
  expect(setPolicy(military,0,'war')).toBe(true);
  expect(setPolicy(rapid,0,'invalid' as never)).toBe(false);
  stepWar(regular,.1);stepWar(rapid,.1);stepWar(military,.1);
  expect(rapid.factions[0].gold).toBeGreaterThan(regular.factions[0].gold);
  expect(military.factions[0].gold).toBeLessThan(regular.factions[0].gold);
 });
 it('limits reserve troops and keeps a defensive detachment behind',()=>{
  const w=createWar();
  expect(setReserve(w,0,7)).toBe(false);
  expect(setReserve(w,0,-1)).toBe(false);
  expect(setReserve(w,0,2.5)).toBe(false);
  expect(setReserve(w,0,3)).toBe(true);
  expect(captureOrder(w,0,4)).toBe(true);
  w.units=w.units.filter(u=>u.owner===0);
  const units=w.units.filter(u=>u.owner===0);
  const first=units[0],last=units[3];
  const a=Math.hypot(first.x,first.z),b=Math.hypot(last.x,last.z);
  for(let i=0;i<30;i++)stepWar(w,.1);
  expect(Math.hypot(first.x,first.z)).toBeGreaterThan(a-3);
  expect(Math.hypot(last.x,last.z)).toBeLessThan(b-10);
 });
 it('specialty outposts produce different resources and announce capture',()=>{
  const w=createWar(),post=w.outposts[0],f=w.factions[0];
  expect(OUTPOST_BONUSES[0].gold).toBeGreaterThan(OUTPOST_BONUSES[2].gold);
  w.units=w.units.filter(u=>u.owner===0);
  w.factions.slice(1).forEach(op=>{op.aiTimer=9999;});
  for(const u of w.units){u.x=post.x;u.z=post.z;}
  for(let i=0;i<230;i++)stepWar(w,.05);
  expect(post.owner).toBe(0);
  expect(w.events.some(e=>e.text.includes('북부 광산'))).toBe(true);
  const gold=f.gold,food=f.food;
  stepWar(w,.1);
  expect(f.gold-gold).toBeCloseTo((1.5+OUTPOST_BONUSES[0].gold)*.1);
  expect(f.food-food).toBeCloseTo((1.3+OUTPOST_BONUSES[0].food)*.1);
 });
 it('stores only a bounded set of strategic events',()=>{
  const w=createWar();
  w.factions.slice(1).forEach(f=>f.aiTimer=9999);
  for(let i=0;i<w.outposts.length;i++){
   const post=w.outposts[i];
   post.contender=0;post.progress=99;
   for(const u of w.units.filter(u=>u.owner===0)){u.x=post.x;u.z=post.z;}
   stepWar(w,.1);
  }
  expect(w.events.length).toBeLessThanOrEqual(8);
  expect(w.events[0].text).toContain('남동부 교역소');
 });

});
