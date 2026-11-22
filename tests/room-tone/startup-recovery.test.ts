import { afterEach, describe, expect, it, vi } from "vitest";
import { modelBytes, releaseModelBytes } from "../../src/room-tone/assets.js";
import { initialMute } from "../../src/room-tone/preferences.mjs";
import { neighbors, paths, makeLevel, chapters } from "../../src/room-tone/levels.mjs";
import { normalizeCampaign } from "../../src/room-tone/campaign.mjs";

describe("ROOM TONE persisted audio preferences",()=>{
  it("prioritizes explicit arcade-wide settings over the legacy game key",()=>{
    expect(initialMute(true,{sound:true})).toBe(false);
    expect(initialMute(false,{sound:false})).toBe(true);
    expect(initialMute(true,undefined)).toBe(true);
    expect(initialMute(false,undefined)).toBe(false);
  });
  it("falls back to the arcade preference for first-time visitors",()=>{
    expect(initialMute(null,{sound:false})).toBe(true);
    expect(initialMute(null,{sound:true})).toBe(false);
    expect(initialMute(undefined,null)).toBe(false);
    expect(initialMute("false",{sound:false})).toBe(true);
    expect(initialMute(true,{theme:"night"})).toBe(true);
  });
});
describe("ROOM TONE model request lifecycle",()=>{
  afterEach(()=>{releaseModelBytes();vi.unstubAllGlobals()});
  it("coalesces simultaneous downloads and releases decoded bytes",async()=>{
    const buffer=new Uint8Array([1,2,3]).buffer;
    const fetchMock=vi.fn(async()=>({ok:true,arrayBuffer:async()=>buffer}));
    vi.stubGlobal("fetch",fetchMock);
    const first=modelBytes();
    const second=modelBytes();
    expect(first).toBe(second);
    expect(await first).toBe(buffer);
    releaseModelBytes();
    expect(await modelBytes()).toBe(buffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not let a late rejected request clear a newer in-flight model",async()=>{
    let failOld:((error:Error)=>void)|undefined;
    let resolveNew:((response:{ok:boolean,arrayBuffer:()=>Promise<ArrayBuffer>})=>void)|undefined;
    const staleFetch=new Promise<never>((_,reject)=>{failOld=reject;});
    const freshFetch=new Promise<{ok:boolean,arrayBuffer:()=>Promise<ArrayBuffer>}>(resolve=>{resolveNew=resolve;});
    const fetchMock=vi.fn().mockImplementationOnce(()=>staleFetch).mockImplementationOnce(()=>freshFetch);
    vi.stubGlobal("fetch",fetchMock);
    const stale=modelBytes();
    releaseModelBytes();
    const active=modelBytes();
    const expectsOld=expect(stale).rejects.toThrow("old network request");
    failOld?.(new Error("old network request"));
    await expectsOld;
    expect(modelBytes()).toBe(active);
    resolveNew?.({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
    await expect(active).resolves.toBeInstanceOf(ArrayBuffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("retries after network failures",async()=>{
    const fetchMock=vi.fn().mockResolvedValueOnce({ok:false,status:503})
      .mockResolvedValue({ok:true,arrayBuffer:async()=>new ArrayBuffer(3)});
    vi.stubGlobal("fetch",fetchMock);
    await expect(modelBytes()).rejects.toThrow("캐릭터 모델 다운로드 실패");
    await expect(modelBytes()).resolves.toBeInstanceOf(ArrayBuffer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
describe("ROOM TONE allocation-free neighbor expansion",()=>{
  it("keeps deterministic neighbor order and path connectivity",()=>{
    const map=["#####","#...#","#.#.#","#...#","#####"];
    expect(neighbors(map,6)).toEqual([7,11]);
    expect(neighbors(map,7)).toEqual([8,6]);
    expect(neighbors(map,11)).toEqual([16,6]);
    expect(neighbors(map,12)).toEqual([]);
    for(let chapter=0;chapter<4;chapter++){
      const level=makeLevel(chapter);
      const tree=paths(level.map,level.start);
      for(const end of [...level.items,level.station,level.exit,level.nest])
        expect(tree.dist[end]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ROOM TONE campaign size derived from actual chapter data",()=>{
  it("accepts the last cell of each generated map",()=>{
    for(const [ch,info] of chapters.entries()){
      const id=info.size**2-1;
      const result=normalizeCampaign({
        v:1,ch,found:[false,false,false],solved:false,elapsed:60,seen:[id,id+1],
      });
      expect(result?.seen).toEqual([id]);
    }
    expect(normalizeCampaign({
      v:1,ch:chapters.length,found:[false,false,false],solved:false,elapsed:1,seen:[],
    })).toBeNull();
  });
});
