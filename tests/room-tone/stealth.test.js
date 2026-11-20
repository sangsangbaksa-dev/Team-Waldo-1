import {describe,it,expect} from "vitest";
import {makeLevel} from "../../src/room-tone/levels.mjs";
import {archiveCells} from "../../src/room-tone/dread.mjs";
import {SPEED,chooseHideouts,senseThreat,hidingCheck} from "../../src/room-tone/stealth.mjs";
const base={distance:6,clear:true,facing:1,flashFacing:0,lightOn:false,lit:false,moving:false,running:false,noise:0,hidden:false};
describe("ROOM TONE stealth",()=>{
 it("creates distinct reachable wall-side hiding places without covering objectives",()=>{
  for(let ch=0;ch<4;ch++){const level=makeLevel(ch),records=archiveCells(level),spots=chooseHideouts(level,records);expect(spots.length).toBeGreaterThanOrEqual(6);expect(new Set(spots.map(o=>o.cell)).size).toBe(spots.length);for(const o of spots){expect(level.reachable).toContain(o.cell);expect([level.start,level.exit,level.nest,...level.items,...records]).not.toContain(o.cell);expect(level.map[Math.floor(o.cell/level.w)+o.dz][o.cell%level.w+o.dx]).toBe("#");}}
 });
 it("distinguishes lamp, ambient light, sight cones and walls",()=>{
  expect(senseThreat(base).visual).toBe(false);
  expect(senseThreat({...base,lit:true}).visual).toBe(true);
  expect(senseThreat({...base,lightOn:true,facing:-1,flashFacing:1}).visual).toBe(true);
  expect(senseThreat({...base,lightOn:true,clear:false,flashFacing:1}).visual).toBe(false);
 });
 it("distinguishes sprint and walk, muffles sound through walls",()=>{
  expect(senseThreat({...base,moving:true}).heard).toBe(false);
  expect(senseThreat({...base,moving:true,running:true}).heard).toBe(true);
  expect(senseThreat({...base,moving:true,running:true,clear:false}).heard).toBe(false);
  expect(senseThreat({...base,noise:8}).heard).toBe(true);
 });
 it("protects a concealed player unless an entry was compromised",()=>{
  expect(senseThreat({...base,hidden:true,lightOn:true,distance:1,moving:true,running:true}).visual).toBe(false);
  expect(senseThreat({...base,hidden:true,moving:true,running:true}).heard).toBe(false);
  expect(hidingCheck(false,0,2,.1)).toBe(0);
  expect(hidingCheck(true,1,1,.4)).toBeGreaterThan(1.35);
  expect(hidingCheck(true,3,1,.1)).toBe(0);
  expect(SPEED.sprint).toBeGreaterThan(SPEED.chase);
 });
});
