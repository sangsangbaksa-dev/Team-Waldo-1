import { afterEach, describe, expect, it, vi } from "vitest";
import { modelBytes, releaseModelBytes } from "../../src/room-tone/assets.js";
import { initialMute } from "../../src/room-tone/preferences.mjs";
import { neighbors, paths, makeLevel } from "../../src/room-tone/levels.mjs";

describe("ROOM TONE persisted audio preferences",()=>{
  it("prefers the explicit game setting over arcade defaults",()=>{
    expect(initialMute(true,{sound:true})).toBe(true);
    expect(initialMute(false,{sound:false})).toBe(false);
    expect(initialMute(false,undefined)).toBe(false);
  });
  it("falls back to the arcade preference for first-time visitors",()=>{
    expect(initialMute(null,{sound:false})).toBe(true);
    expect(initialMute(null,{sound:true})).toBe(false);
    expect(initialMute(undefined,null)).toBe(false);
    expect(initialMute("false",{sound:false})).toBe(true);
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
