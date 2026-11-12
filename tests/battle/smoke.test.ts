import { describe, expect, it } from 'vitest';
import { createWar, MAP_HALF_SIZE, MAX_UNITS, OUTPOST_BONUSES, stepWar } from '../../src/battle/war';

/** A long deterministic simulation catches regressions invisible in single-step unit tests. */
describe('large map long-session simulation',()=>{
 it('keeps AI, armies, income and territory state finite over five game minutes',()=>{
  const w=createWar();
  for(let tick=0;tick<3000;tick++){
   stepWar(w,.1);
   if(tick%25!==0)continue;
   expect(Number.isFinite(w.time)).toBe(true);
   expect(w.zone).toBeGreaterThanOrEqual(24);
   expect(w.zone).toBeLessThanOrEqual(MAP_HALF_SIZE-6);
   expect(w.events.length).toBeLessThanOrEqual(8);
   for(const f of w.factions){
    expect(Number.isFinite(f.gold)).toBe(true);
    expect(Number.isFinite(f.food)).toBe(true);
    expect(f.gold).toBeGreaterThanOrEqual(0);
    expect(f.food).toBeGreaterThanOrEqual(0);
    expect(f.hp).toBeGreaterThanOrEqual(0);
    expect(w.units.filter(u=>u.owner===f.id).length).toBeLessThanOrEqual(MAX_UNITS);
   }
   for(const u of w.units){
    expect(Number.isFinite(u.x)).toBe(true);
    expect(Number.isFinite(u.z)).toBe(true);
    expect(u.hp).toBeGreaterThan(0);
   }
   for(const post of w.outposts){
    expect(post.progress).toBeGreaterThanOrEqual(0);
    expect(post.progress).toBeLessThan(100);
    expect(OUTPOST_BONUSES[post.id]).toBeDefined();
   }
  }
  // The three opponents must actually leave home and claim territory.
  expect(w.outposts.some(p=>p.owner!==null)).toBe(true);
  expect(w.time).toBeGreaterThan(100);
 });
});
