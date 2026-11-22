import { describe, expect, it } from "vitest";
import { renderingScale } from "../../src/room-tone/render-quality.mjs";
describe("ROOM TONE render resolution budget",()=>{
  it("caps GPU pixels on large monitors without changing CSS viewport",()=>{
    const ratio=renderingScale(3840,2160,3,"high");
    expect(ratio).toBeGreaterThan(0.1);
    expect(Math.pow(ratio,2)*3840*2160).toBeLessThanOrEqual(2200000+25000);
    expect(ratio).toBeLessThan(1);
  });
  it("honors low, standard and high detail preferences",()=>{
    const width=1280,height=720;
    const low=renderingScale(width,height,3,"low");
    const standard=renderingScale(width,height,3,"standard");
    const high=renderingScale(width,height,3,"high");
    expect(low).toBeLessThan(standard);
    expect(standard).toBeLessThan(high);
  });
  it("does not increase a physically low display pixel density",()=>{
    expect(renderingScale(300,200,0.8,"high")).toBe(0.8);
  });
  it("falls back safely for invalid preference and device metrics",()=>{
    expect(renderingScale(400,700,3,"ultra",true)).toBeLessThanOrEqual(1.4);
    expect(renderingScale(400,700,3,"ultra",false)).toBeGreaterThanOrEqual(1.4);
    expect(Number.isFinite(renderingScale(NaN,0,NaN,null,true))).toBe(true);
  });
});
