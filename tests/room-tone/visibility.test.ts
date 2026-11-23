import { describe, expect, it } from "vitest";
import { lineClear, soundTravelDistance } from "../../src/room-tone/visibility.mjs";
import { makeLevel } from "../../src/room-tone/levels.mjs";

const p = (x: number, z: number) => ({ x, z });

describe("ROOM TONE wall-corner visibility", () => {
  it("allows an open corridor and symmetrical sight", () => {
    const map = ["....", "....", "....", "...."];
    const a = p(0, 0), b = p(3, 3);
    expect(lineClear(map, 1, a, b)).toBe(true);
    expect(lineClear(map, 1, b, a)).toBe(true);
    expect(lineClear(map, 1, a, a)).toBe(true);
  });

  it("rejects diagonal vision through blocked touching corners", () => {
    expect(lineClear([".#", "#."], 1, p(0, 0), p(1, 1))).toBe(false);
    expect(lineClear([".#", "#."], 1, p(1, 1), p(0, 0))).toBe(false);
    expect(lineClear(["..#", "#..", "..."], 1, p(0, 0), p(2, 2))).toBe(false);
  });

  it("rejects walls, outside endpoints, and invalid coordinates", () => {
    const map = ["...", "###", "..."];
    expect(lineClear(map, 2.7, p(0, 0), p(0, 5.4))).toBe(false);
    expect(lineClear(["..."], 2.7, p(0, 0), p(5.4, 0))).toBe(true);
    expect(lineClear(["..."], 2.7, p(0, 0), p(-2.7, 0))).toBe(false);
    expect(lineClear(["..."], 0, p(0, 0), p(1, 0))).toBe(false);
    expect(lineClear(["..."], 1, p(Number.NaN, 0), p(1, 0))).toBe(false);
  });
});

describe("ROOM TONE corridor-aware hearing", () => {
  it("uses physical distance on visible corridors", () => {
    expect(soundTravelDistance(true, 3.25, 99, 2.7)).toBe(3.25);
    expect(soundTravelDistance(true, Number.NaN, 2, 2.7)).toBe(Infinity);
  });

  it("reduces detection through long detours and disconnected rooms", () => {
    expect(soundTravelDistance(false, 2, 2, 2.7)).toBeCloseTo(4.05);
    expect(soundTravelDistance(false, 2, 7, 2.7)).toBeCloseTo(17.55);
    expect(soundTravelDistance(false, 2, -1, 2.7)).toBe(Infinity);
    expect(soundTravelDistance(false, 2, Number.NaN, 2.7)).toBe(Infinity);
  });
});

describe("ROOM TONE generated maze line-of-sight regression", () => {
  it("is symmetric across many real chapter corridors", () => {
    for (let chapter = 0; chapter < 4; chapter++) {
      const level = makeLevel(chapter);
      const point = (cell: number) => ({
        x: (cell % level.w) * 2.7,
        z: Math.floor(cell / level.w) * 2.7,
      });
      const samples = level.reachable.slice(0, 45);
      for (const a of samples) for (const b of samples) {
        expect(lineClear(level.map, 2.7, point(a), point(b)))
          .toBe(lineClear(level.map, 2.7, point(b), point(a)));
      }
    }
  });
});
