import {test} from "vitest";
import assert from "node:assert/strict";
import {canLock,wrapAngle,capturePointer,canSaveState,motionState,stepRemainder} from "../../src/room-tone/runtime.mjs";
test("touch and pen cannot accidentally lock the mouse",()=>{
 assert.equal(canLock(true,"mouse",true),false);assert.equal(canLock(false,"pen",true),false);assert.equal(canLock(false,"mouse",false),false);assert.ok(canLock(false,"mouse",true));
});
test("pointer capture failures are safe",()=>{assert.equal(capturePointer({setPointerCapture(){throw Error("lost pointer")}},1),false);assert.ok(capturePointer({setPointerCapture(){}},1));});
test("all live menu states are saved, not title, loading or won",()=>{for(const state of ["play","exit","map","pause","settings","station","puzzle","brief","help","archive","lost"])assert.ok(canSaveState(state));for(const state of ["home","load","won","error"])assert.equal(canSaveState(state),false);});
test("motion setting respects both accessibility preferences",()=>{assert.equal(motionState(true,true),"reduced");assert.equal(motionState(false,false),"reduced");assert.equal(motionState(true,false),"normal");});
test("angles and footsteps preserve bounded rotation and fractional distance",()=>{assert.equal(wrapAngle(Infinity),0);assert.ok(Math.abs(wrapAngle(100*Math.PI+.2)-.2)<1e-10);assert.ok(Math.abs(stepRemainder(1.1,1)-.1)<1e-10);});
