import { describe, expect, it } from "vitest";
import { facingDot, canSeeTarget } from "../../src/room-tone/awareness.mjs";

const point = (x: number, z: number) => ({ x, z });
describe("ROOM TONE monster vision and stealth", () => {
  it("sees forward while ignoring a player behind at normal range", () => {
    const monster = point(0, 0);
    expect(facingDot(0, monster, point(0, 5))).toBeCloseTo(1);
    expect(facingDot(0, monster, point(0, -5))).toBeCloseTo(-1);
    expect(canSeeTarget(5, true, true, facingDot(0, monster, point(0, 5)))).toBe(true);
    expect(canSeeTarget(5, true, true, facingDot(0, monster, point(0, -5)))).toBe(false);
  });
  it("allows close-range peripheral awareness", () => {
    expect(canSeeTarget(2.3, true, false, -1)).toBe(true);
    expect(canSeeTarget(2.6, true, false, -1)).toBe(false);
  });
  it("uses the flashlight range but never sees through walls", () => {
    expect(canSeeTarget(9, true, true, 0)).toBe(true);
    expect(canSeeTarget(9, true, false, 1)).toBe(false);
    expect(canSeeTarget(1, false, true, 1)).toBe(false);
  });
  it("handles turning and invalid input safely", () => {
    expect(facingDot(Math.PI / 2, point(0, 0), point(1, 0))).toBeCloseTo(1);
    expect(facingDot(Math.PI, point(0, 0), point(0, -1))).toBeCloseTo(1);
    expect(facingDot(0, point(0, 0), point(0, 0))).toBe(1);
    expect(facingDot(NaN, point(0, 0), point(1, 1))).toBe(-1);
    expect(canSeeTarget(Infinity, true, true, 1)).toBe(false);
  });
});
