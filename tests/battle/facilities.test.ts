import { describe,it,expect } from 'vitest';
import {createWar,stepWar,getIncome,GRAND_INITIAL_FORCES,MAP_SIZE} from '../../src/battle/war';
import {autoBuildFacility,buildFacility,facilitiesFor,FACILITY_TYPES,buildInterior} from '../../src/battle/facilities';
import {MOUNTAINS,walkable,moveAcrossTerrain} from '../../src/battle/terrain';
import {encodeWar,decodeWar} from '../../src/battle/save';
import {applyPlayerCommand} from '../../src/battle/pvpCommands';
describe('expanded campaign facilities and terrain',()=>{
 it('starts with equal forces and distributes 33 objectives across a 1040-unit world',()=>{
  const w=createWar({grandBattle:true});expect(MAP_SIZE).toBe(1040);expect(GRAND_INITIAL_FORCES).toEqual([100,100,100,100]);expect(w.units).toHaveLength(400);expect(w.outposts).toHaveLength(33);
  expect(Math.max(...w.outposts.map(p=>Math.hypot(p.x,p.z)))).toBeGreaterThan(450);
  expect(w.outposts.every(p=>walkable(p.x,p.z,14))).toBe(true);
  expect(w.factions.every(f=>f.gold===6500&&f.food===6000)).toBe(true);
 });
 it('caps each kingdom at HQ plus 29 buildings and refuses costs atomically',()=>{
  const w=createWar();w.factions[0].gold=100000;w.factions[0].food=100000;
  for(let i=0;i<29;i++)expect(autoBuildFacility(w,0,'farm')).toBe(true);
  expect(facilitiesFor(w,0)).toHaveLength(29);const gold=w.factions[0].gold;
  expect(autoBuildFacility(w,0,'mine')).toBe(false);expect(w.factions[0].gold).toBe(gold);
  expect(decodeWar(encodeWar(w))).toEqual(w);
 });
 it('only completed buildings generate income and destroyed production stops',()=>{
  const w=createWar();w.humanFactions=[0,1,2,3];const income=getIncome(w,0).gold;
  expect(autoBuildFacility(w,0,'mine')).toBe(true);expect(getIncome(w,0).gold).toBe(income);
  for(let i=0;i<121;i++)stepWar(w,.1);
  expect(getIncome(w,0).gold).toBeCloseTo(income+FACILITY_TYPES.mine.incomeGold);
  w.facilities![0].hp=0;stepWar(w,.1);expect(getIncome(w,0).gold).toBe(income);
 });
 it('rejects construction on mountains, beyond supply, and on HQ footprints',()=>{
  const w=createWar();w.factions[0].gold=10000;w.factions[0].food=10000;
  expect(buildFacility(w,0,'mine',w.factions[0].x,w.factions[0].z)).toBe(false);
  expect(buildFacility(w,0,'mine',500,500)).toBe(false);
  const m=MOUNTAINS[0];expect(buildFacility(w,0,'mine',m.x,m.z)).toBe(false);
 });
 it('routes around an impassable ridge and reaches the destination',()=>{
  const m=MOUNTAINS[0];let p:{x:number;z:number}={x:m.x-90,z:m.z};const target={x:m.x+90,z:m.z};let detour=0;
  for(let i=0;i<1600&&Math.hypot(p.x-target.x,p.z-target.z)>1;i++){
   p=moveAcrossTerrain(p.x,p.z,target.x,target.z,1);expect(walkable(p.x,p.z)).toBe(true);detour=Math.max(detour,Math.abs(p.z-m.z));
  }
  expect(detour).toBeGreaterThan(m.radius);expect(Math.hypot(p.x-target.x,p.z-target.z)).toBeLessThan(2);
 });
 it('builds inside exact grid cells and applies medical and research effects after completion',()=>{
  const w=createWar({grandBattle:true});w.humanFactions=[0,1,2,3];
  expect(buildInterior(w,0,'hospital',0,2,1)).toBe(true);
  expect(buildInterior(w,0,'school',0,2,1)).toBe(false);
  expect(buildInterior(w,0,'university',0,3,1)).toBe(true);
  expect(buildInterior(w,0,'school',999,1,1)).toBe(false);
  const soldier=w.units.find(u=>u.owner===0)!;soldier.x=w.factions[0].x;soldier.z=w.factions[0].z;soldier.hp=10;
  for(let i=0;i<270;i++)stepWar(w,.1);
  expect(soldier.hp).toBeGreaterThan(10);expect(w.factions[0].researchDiscount).toBe(.05);
  expect(decodeWar(encodeWar(w))).toEqual(w);
 });
 it('applies network commands to the authenticated seat, never another faction',()=>{
  const w=createWar({grandBattle:true});w.humanFactions=[0,1];const before=w.factions.map(f=>f.gold);
  expect(applyPlayerCommand(w,1,{type:'build',key:'farm'})).toBe(true);
  expect(w.factions[0].gold).toBe(before[0]);expect(w.factions[1].gold).toBe(before[1]-65);
  expect(applyPlayerCommand(w,2,{type:'build',key:'farm'})).toBe(false);
  expect(applyPlayerCommand(w,1,{type:'train',key:'__proto__',amount:10})).toBe(false);
 });
});
