import { test } from "vitest";
import assert from "node:assert/strict";
import { createRoomStorage } from "../../src/room-tone/storage.mjs";
test("blocked storage retains independent session snapshots",()=>{
  const store=createRoomStorage(()=>{ throw new Error("blocked"); });
  const progress={found:[true,false,false]};
  assert.equal(store.write("save",progress),false);
  progress.found[0]=false;
  assert.deepEqual(store.read("save"),{found:[true,false,false]});
  assert.equal(store.remove("save"),false);
  assert.equal(store.read("save"),null);
});
test("successful writes persist and malformed records fail safely",()=>{
  const backing=new Map<string,string>([["broken","{"]]);
  const getStorage=()=>({getItem:(k:string)=>backing.get(k)??null,setItem:(k:string,v:string)=>{backing.set(k,v);},removeItem:(k:string)=>{backing.delete(k);}});
  const store=createRoomStorage(getStorage);
  assert.equal(store.read("broken"),null);
  assert.equal(store.write("save",{ch:2}),true);
  assert.deepEqual(createRoomStorage(getStorage).read("save"),{ch:2});
  assert.equal(store.remove("save"),true);
  assert.equal(createRoomStorage(getStorage).read("save"),null);
});
