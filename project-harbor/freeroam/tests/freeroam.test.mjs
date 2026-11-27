import test from 'node:test';
import assert from 'node:assert/strict';
import {createFreeRoam} from '../freeroam-domain.mjs';
const layout={landmarks:[{id:'a',name:'A',position:[0,0,0]}]};
const frame=(x,z,driving=false,speed=0,y=0)=>({alive:true,position:{x,y,z},state:{isDriving:driving,vehicle:{position:{x,y,z},speed}}});
test('only on foot and at correct elevation; discoveries persist',()=>{const g=createFreeRoam(layout);assert.equal(g.update(frame(0,0,true),.1),false);assert.equal(g.update(frame(0,0,false,0,9),.1),false);assert.equal(g.update(frame(0,0),.1),true);assert.equal(g.update(frame(0,0),.1),false);assert.equal(createFreeRoam(layout,g.record).view(frame(0,0)).visited,1);});
test('ordered checkpoints and best time; exit cancels',()=>{const g=createFreeRoam(layout);g.toggle(frame(-130,33,true));for(let x=-130;x<=99;x++){g.update(frame(x,33,true),.1);}assert.ok(g.record.best.quay>0);g.toggle(frame(-130,33,true));g.update(frame(-130,33),.1);assert.equal(g.view(frame(-130,33)).active,null);});
test('speed trap stores peak after crossing and rejects teleports',()=>{const g=createFreeRoam(layout);g.update(frame(99,-90,true,12),.1);g.update(frame(99,-80,true,20),.1);assert.equal(g.update(frame(99,-65,true,10),.1),true);assert.equal(g.record.speeds.lighthouse,72);g.update(frame(99,-80,true,30),.1);g.update(frame(99,-10,true,30),.1);assert.equal(g.record.speeds.lighthouse,72);});
test('invalid or stale saved values sanitized',()=>{const g=createFreeRoam(layout,{visited:['a','a','bad'],best:{quay:-1},speeds:{lighthouse:'80'}});assert.deepEqual(g.record,{visited:['a'],best:{},speeds:{}});});
