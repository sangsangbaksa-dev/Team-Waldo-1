import { describe, expect, it } from 'vitest';
import { captureOrder, createWar, setPolicy, setReserve, stepWar } from '../../src/battle/war';
import { decodeWar, encodeWar, loadWar, saveWar } from '../../src/battle/save';

describe('war save and recovery',()=>{
 it('round-trips the entire match state with nine objective IDs',()=>{
  const w=createWar();
  captureOrder(w,0,8);setPolicy(w,0,'growth');setReserve(w,0,4);
  for(let i=0;i<80;i++)stepWar(w,.1);
  const restored=decodeWar(encodeWar(w));
  expect(restored).toEqual(w);
  expect(restored?.factions[0].rally).toBe(8);
  expect(restored?.factions[0].reserve).toBe(4);
 });
 it('rejects empty, invalid, and oversized saves safely',()=>{
  expect(decodeWar(null)).toBeNull();
  expect(decodeWar('{broken')).toBeNull();
  expect(decodeWar('x'.repeat(150001))).toBeNull();
  expect(decodeWar(JSON.stringify({version:0,war:createWar()}))).toBeNull();
 });
 it('rejects altered coordinates, duplicate IDs, invalid policies and unit kinds',()=>{
  const base=createWar();
  const mutate=(fn:(w:ReturnType<typeof createWar>)=>void)=>{
   const cloned=JSON.parse(JSON.stringify(base)) as ReturnType<typeof createWar>;
   fn(cloned);return JSON.stringify({version:1,war:cloned});
  };
  expect(decodeWar(mutate(w=>{w.factions[0].x=999;}))).toBeNull();
  expect(decodeWar(mutate(w=>{w.factions[0].policy='invalid' as never;}))).toBeNull();
  expect(decodeWar(mutate(w=>{w.units[1].id=w.units[0].id;}))).toBeNull();
  expect(decodeWar(mutate(w=>{w.units[0].kind='dragon' as never;}))).toBeNull();
  expect(decodeWar(mutate(w=>{w.outposts[7].owner=8;}))).toBeNull();
 });
 it('handles denied storage access without crashing the battle',()=>{
  const w=createWar();
  expect(loadWar()).toBeNull();
  expect(saveWar(w)).toBe(false);
 });
});
