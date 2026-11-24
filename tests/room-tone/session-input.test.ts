import { describe, expect, it } from "vitest";
import { normalizeCampaign } from "../../src/room-tone/campaign.mjs";
import { createPointerOwner, tryCapture } from "../../src/room-tone/input.mjs";
describe("ROOM TONE saved campaign validation",()=>{
  const good={v:1,ch:2,found:[true,true,true],solved:true,elapsed:103.4,seen:[26,27,51]};
  it("keeps valid progress without aliasing mutable arrays",()=>{
    const parsed=normalizeCampaign(good);
    expect(parsed).toEqual(good);
    expect(parsed?.found).not.toBe(good.found);
    expect(parsed?.seen).not.toBe(good.seen);
  });
  it("rejects malformed chapters, puzzle state and time",()=>{
    const invalid=[
      null,[],true,{}, {...good,v:2}, {...good,ch:-1}, {...good,ch:4},
      {...good,ch:2.2}, {...good,found:null}, {...good,found:[true,true]},
      {...good,found:[true,1,true]}, {...good,solved:"true"},
      {...good,solved:true,found:[true,false,true]},
      {...good,elapsed:NaN}, {...good,elapsed:Infinity}, {...good,elapsed:-1},
    ];
    for(const value of invalid) expect(normalizeCampaign(value)).toBeNull();
  });
  it("filters invalid explored tiles and malformed visited arrays",()=>{
    const data=normalizeCampaign({...good,ch:0,seen:[0,0,12,440,441,-1,1.5,"12",NaN]});
    expect(data?.seen).toEqual([0,12,440]);
    expect(normalizeCampaign({...good,seen:"corrupt"})?.seen).toEqual([]);
    expect(normalizeCampaign({...good,seen:null})?.seen).toEqual([]);
  });
});
describe("ROOM TONE multi-touch pointer ownership",()=>{
  it("cannot steal an existing joystick gesture",()=>{
    const owner=createPointerOwner();
    expect(owner.claim(12)).toBe(true);
    expect(owner.claim(13)).toBe(false);
    expect(owner.owns(12)).toBe(true);
    expect(owner.owns(13)).toBe(false);
    expect(owner.release(13)).toBe(false);
    expect(owner.owns(12)).toBe(true);
    expect(owner.release(12)).toBe(true);
    expect(owner.claim(13)).toBe(true);
  });
  it("clears on pause and rejects invalid IDs",()=>{
    const owner=createPointerOwner();
    expect(owner.claim(-1)).toBe(false);
    expect(owner.claim(NaN)).toBe(false);
    expect(owner.claim(1)).toBe(true);
    owner.clear();
    expect(owner.owns(1)).toBe(false);
    expect(owner.claim(2)).toBe(true);
  });
  it("reports the active pointer so a pause can release capture",()=>{
    const owner=createPointerOwner();
    expect(owner.current()).toBeNull();
    expect(owner.claim(7)).toBe(true);
    expect(owner.current()).toBe(7);
    owner.clear();
    expect(owner.current()).toBeNull();
  });
  it("does not crash on unavailable pointer capture",()=>{
    expect(tryCapture({setPointerCapture(){}},4)).toBe(true);
    expect(tryCapture({setPointerCapture(){throw Error("unavailable")}},4)).toBe(false);
  });
});
