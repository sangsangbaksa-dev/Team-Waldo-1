import { test } from "vitest";
import assert from "node:assert/strict";
import { makeLevel, chapters, paths } from "../../src/room-tone/levels.mjs";
import { archiveCells, cleanArchive, createDread, incidents } from "../../src/room-tone/dread.mjs";
test("recordings are distinct, reachable and off required props",()=>{
  chapters.forEach((_,ch)=>{
    const l=makeLevel(ch), cells=archiveCells(l);
    assert.equal(cells.length,2);
    assert.equal(new Set([l.start,l.exit,l.nest,...l.items,...cells]).size,8);
    assert.ok(cells.every(c=>paths(l.map,l.start).dist[c]>0));
    assert.deepEqual(archiveCells(l),cells);
  });
});
test("old and malformed saves are supported",()=>{
  assert.deepEqual(cleanArchive(undefined),[]);
  assert.deepEqual(cleanArchive([0,0,7,-1,8,"1",2.5,null]),[0,7]);
});
test("director respects cooldown and avoids consecutive repeats",()=>{
  const d=createDread(()=>0);
  assert.equal(d.tick(30,false),null);
  assert.equal(d.tick(1,true)?.kind,incidents[0].kind);
  assert.equal(d.tick(.2,true)?.started,false);
  assert.equal(d.tick(3,false),null);
  assert.equal(d.tick(30,false),null);
  assert.equal(d.tick(.1,true)?.kind,incidents[1].kind);
});

test("later wings unlock new incidents without repeats",()=>{
  const early=createDread(()=>.999,0), late=createDread(()=>.999,3);
  assert.equal(early.tick(30,true)?.kind,"breath");
  assert.equal(late.tick(30,true)?.kind,"relay");
  assert.equal(late.tick(4,false),null);
  assert.equal(late.tick(40,true)?.kind,"knock");
});
test("cooldown counts only time after an incident ends",()=>{
  const d=createDread(()=>0);
  assert.equal(d.tick(22,true)?.kind,"knock");
  assert.equal(d.tick(3,true),null);
  assert.equal(d.tick(16,true),null);
  assert.equal(d.tick(2,true)?.kind,"drop");
});
