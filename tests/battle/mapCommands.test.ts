import { describe, expect, it } from 'vitest';
import { createWar, MAP_HALF_SIZE } from '../../src/battle/war';
import { minimapToWorld, pickMapTarget, worldToMinimap } from '../../src/battle/mapCommands';

describe('strategic minimap actions',()=>{
 it('round-trips world coordinates between the map and the battlefield',()=>{
  for(const [x,z] of [[0,0],[-112,-112],[95,0],[MAP_HALF_SIZE,MAP_HALF_SIZE]]){
   const projected=worldToMinimap(x,z);
   const restored=minimapToWorld(projected.x,projected.y,200,200);
   expect(restored.x).toBeCloseTo(x);
   expect(restored.z).toBeCloseTo(z);
  }
 });
 it('clamps clicks and avoids invalid division',()=>{
  expect(minimapToWorld(-100,400,200,200)).toEqual({x:-MAP_HALF_SIZE,z:MAP_HALF_SIZE});
  expect(minimapToWorld(3,2,0,0)).toEqual({x:0,z:0});
  expect(minimapToWorld(Number.NaN,1,100,100)).toEqual({x:0,z:0});
 });
 it('detects click targets but excludes friendly or eliminated headquarters',()=>{
  const w=createWar();
  const enemy=w.factions[1],own=w.factions[0];
  expect(pickMapTarget(w,0,enemy.x,enemy.z)).toEqual({kind:'faction',id:1});
  expect(pickMapTarget(w,0,w.outposts[8].x,w.outposts[8].z)).toEqual({kind:'outpost',id:8});
  expect(pickMapTarget(w,0,own.x,own.z)).toBeNull();
  enemy.alive=false;
  expect(pickMapTarget(w,0,enemy.x,enemy.z)).toBeNull();
  expect(pickMapTarget(w,0,700,700)).toBeNull();
 });
});
