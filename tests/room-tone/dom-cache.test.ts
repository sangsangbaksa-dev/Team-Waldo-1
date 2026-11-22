import { describe, expect, it, vi } from "vitest";
import { createIdLookup } from "../../src/room-tone/dom.mjs";
describe("ROOM TONE cached static DOM controls",()=>{
  it("fetches a stable ID once despite repeated render-loop access",()=>{
    const first={} as HTMLElement;
    const root={getElementById:vi.fn((id:string)=>id==="timer"?first:null)};
    const $=createIdLookup(root);
    for(let i=0;i<100;i++)expect($("timer")).toBe(first);
    expect(root.getElementById).toHaveBeenCalledTimes(1);
  });
  it("does not cache a missing node before it becomes available",()=>{
    const nodes=new Map<string,HTMLElement>();
    const root={getElementById:vi.fn((id:string)=>nodes.get(id)??null)};
    const $=createIdLookup(root);
    expect($("guide")).toBeNull();
    const node={} as HTMLElement;
    nodes.set("guide",node);
    expect($("guide")).toBe(node);
    expect($("guide")).toBe(node);
    expect(root.getElementById).toHaveBeenCalledTimes(2);
  });
  it("separates caches belonging to different documents",()=>{
    const first={} as HTMLElement,second={} as HTMLElement;
    const a=createIdLookup({getElementById:()=>first});
    const b=createIdLookup({getElementById:()=>second});
    expect(a("timer")).toBe(first);
    expect(b("timer")).toBe(second);
  });
});
