import { describe, expect, it } from "vitest";
import { reducedMotionOn } from "../../src/room-tone/motion-preferences.mjs";

describe("ROOM TONE arcade-wide reduced-motion controls", () => {
  it("enables reduced effects when user explicitly requests it", () => {
    expect(reducedMotionOn(false,{reducedMotion:true})).toBe(true);
    expect(reducedMotionOn(false,{reducedMotion:false})).toBe(false);
  });
  it("always respects the OS accessibility setting", () => {
    expect(reducedMotionOn(true,{reducedMotion:false})).toBe(true);
    expect(reducedMotionOn(true,null)).toBe(true);
  });
  it("defaults to normal motion unless an accessibility option requests otherwise", () => {
    expect(reducedMotionOn(false,undefined)).toBe(false);
    expect(reducedMotionOn(false,{reducedMotion:"true"})).toBe(false);
  });
});
