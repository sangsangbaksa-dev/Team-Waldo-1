import { test } from "vitest";
import assert from "node:assert/strict";
import { exitWall, propBlocks, clearanceAllows } from "../../src/room-tone/space.mjs";
import { makeLevel } from "../../src/room-tone/levels.mjs";

test("each exit reserves a solid wall and never a navigable face",()=>{
  for(let ch=0;ch<4;ch++){
    const level=makeLevel(ch), face=exitWall(level.map,level.exit);
    if(face){
      const [dx,dz]=face;
      assert.equal(level.map[Math.floor(level.exit/level.w)+dz][level.exit%level.w+dx],"#");
    }
  }
  assert.deepEqual(exitWall(["###","#.#","###"],4),[0,-1]);
  assert.equal(exitWall(["...","...","..."],4),null);
  assert.equal(exitWall(["###","#.#","###"],0),null);
});

test("equipment collision uses rotated shapes and a circular player footprint",()=>{
  const r=.285;
  assert.ok(propBlocks(0,0,r,0,0,0,.455,.275));
  assert.equal(propBlocks(.9,0,r,0,0,0,.455,.275),false);
  assert.ok(propBlocks(0,.65,r,0,0,Math.PI/2,.455,.275));
  assert.equal(propBlocks(.65,0,r,0,0,Math.PI/2,.455,.275),false);
  // Even the widest console leaves navigation channels on either side.
  for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    for(const side of [-1,1]){
      assert.equal(propBlocks(side*.95,0,r,0,0,rotation,.455,.275),false);
      assert.equal(propBlocks(0,side*.95,r,0,0,rotation,.455,.275),false);
    }
  }
});

test("collected props release collision and overlap recovery only moves outward",()=>{
  const o={x:0,z:0,ry:0,halfWidth:.455,halfDepth:.275,visible:true};
  assert.equal(clearanceAllows(.5,0,.8,0,.285,[o]),false);
  assert.equal(clearanceAllows(.5,0,.3,0,.285,[o]),true);
  assert.equal(clearanceAllows(.2,0,.3,0,.285,[o]),false);
  assert.equal(clearanceAllows(0,0,.8,0,.285,[{...o,visible:false}]),true);
});
