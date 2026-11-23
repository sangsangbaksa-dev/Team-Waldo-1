import { describe, expect, it } from "vitest";
import { circleHitsProp, propClearance } from "../../src/room-tone/obstacles.mjs";
const base = { x:0,z:0,rotation:0,halfWidth:0.45,halfDepth:0.27,visible:true };
describe("ROOM TONE solid prop footprints", () => {
  it("blocks direct movement into real equipment but leaves safe channels", () => {
    expect(circleHitsProp(0,0,0.225,base)).toBe(true);
    expect(circleHitsProp(0.8,0,0.225,base)).toBe(false);
    expect(circleHitsProp(0,0.8,0.225,base)).toBe(false);
    expect(circleHitsProp(0.5,0.4,0.225,base)).toBe(false);
    expect(circleHitsProp(NaN,0,0.225,base)).toBe(false);
  });
  it("handles rotated furniture without collision leaks", () => {
    const turned={...base,rotation:Math.PI/2};
    expect(circleHitsProp(0,0.5,0.225,turned)).toBe(true);
    expect(circleHitsProp(0.6,0,0.225,turned)).toBe(false);
  });
  it("prevents walking through props and releases collected items", () => {
    expect(propClearance(0.5,0,1,0,0.225,[base])).toBe(false);
    expect(propClearance(0.8,0,1,0,0.225,[base])).toBe(true);
    expect(propClearance(0.3,0,0.4,0,0.225,[base])).toBe(false);
    expect(propClearance(0.5,0,1,0,0.225,[{...base,visible:false}])).toBe(true);
    expect(propClearance(0.5,0,1,0,0.225,[{...base,root:{visible:false}}])).toBe(true);
  });
  it("lets a player escape an overlapping old position without trapping them", () => {
    expect(propClearance(0.5,0,0.3,0,0.225,[base])).toBe(true);
    expect(propClearance(0.2,0,0.3,0,0.225,[base])).toBe(false);
  });
});
