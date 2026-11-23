import {test} from "vitest";
import assert from "node:assert/strict";
import {RECORDER_LIMIT,recorderUses,placementCell,advanceRecorder,recorderAudible} from "../../src/room-tone/recorder.mjs";
import {makeLevel,paths,normalizeSave} from "../../src/room-tone/levels.mjs";
test("recorder placement follows corridors but does not pass walls",()=>{
  const map=["#######","#.....#","#.....#","#.....#","#######"];
  assert.equal(placementCell(map,17,0),10);
  assert.equal(placementCell(map,17,Math.PI/2),15);
  assert.equal(placementCell(map,17,-Math.PI/2),19);
  assert.equal(placementCell(["###","#.#","###"],4,0),4);
  assert.equal(placementCell(map,0,0),null);
  assert.equal(placementCell(map,17,NaN),null);
  for(let ch=0;ch<4;ch++){
    const level=makeLevel(ch), start=level.start;
    const cells=[0,Math.PI/2,Math.PI,-Math.PI/2]
      .map(yaw=>placementCell(level.map,start,yaw)).filter(v=>v!==null);
    assert.ok(cells.length>0);
    for(const cell of cells){
      assert.ok(level.reachable.includes(cell));
      const d=paths(level.map,start).dist[cell];
      assert.ok(d>=1 && d<=3);
    }
  }
});
test("recorder pulses exactly three times, then expires without timers",()=>{
  const r={cell:12,age:0,pulses:0};
  let result=advanceRecorder(r,.4);
  assert.equal(result.pulse,false);
  assert.equal(recorderAudible(result.recorder,2),false);
  result=advanceRecorder(result.recorder,.2);
  assert.equal(result.pulse,true);
  assert.equal(recorderAudible(result.recorder,10),true);
  assert.equal(recorderAudible(result.recorder,11),false);
  assert.equal(recorderAudible(result.recorder,-1),false);
  assert.equal(recorderAudible(result.recorder,Infinity),false);
  assert.equal(advanceRecorder(result.recorder,0).recorder,result.recorder);
  result=advanceRecorder(result.recorder,1.7);
  assert.equal(result.pulse,true);
  result=advanceRecorder(result.recorder,1.7);
  assert.equal(result.pulse,true);
  result=advanceRecorder(result.recorder,1);
  assert.equal(result.pulse,false);
  result=advanceRecorder(result.recorder,1.5);
  assert.equal(result.recorder,null);
  assert.equal(result.pulse,false);
});
test("recorder charges are bounded and restored with checkpoints",()=>{
  assert.equal(RECORDER_LIMIT,2);
  for(const [input,expected] of [[null,0],[-1,0],[1,1],[3,2],[.5,0],["2",0],[Infinity,0]])
    assert.equal(recorderUses(input),expected);
  const save={v:1,ch:2,found:[false,false,false],solved:false,seen:[],elapsed:12};
  assert.equal(normalizeSave(save)?.recorderUsed,0);
  assert.equal(normalizeSave({...save,recorderUsed:1})?.recorderUsed,1);
  assert.equal(normalizeSave({...save,recorderUsed:999})?.recorderUsed,2);
  assert.equal(normalizeSave({...save,recorderUsed:"2"})?.recorderUsed,0);
});