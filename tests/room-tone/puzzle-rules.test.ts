import { describe, expect, it } from "vitest";
import { chapters } from "../../src/room-tone/levels.mjs";
import { dialOptions, expectedSequence } from "../../src/room-tone/puzzle-rules.mjs";

describe("ROOM TONE puzzle solutions follow actual recovered notes",()=>{
  it("solves all four chapters from the labels shown to the player",()=>{
    expect(chapters).toHaveLength(4);
    expect(expectedSequence(0,chapters[0].labels)).toEqual([0,1,2]);
    expect(expectedSequence(1,chapters[1].labels)).toEqual([1,3,1]);
    expect(expectedSequence(2,chapters[2].labels)).toEqual([1,2,0]);
    expect(expectedSequence(3,chapters[3].labels)).toEqual([2,1,0]);
  });
  it("always selects available dial values",()=>{
    for(const chapter of [0,1,3]){
      const actual=expectedSequence(chapter,chapters[chapter].labels);
      actual.forEach((index,slot)=>{
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(dialOptions(chapter,slot).length);
      });
    }
  });
  it("reflects changed clue labels rather than retaining a stale hardcoded answer",()=>{
    expect(expectedSequence(0,["15 A","5 A","10 A"])).toEqual([2,0,1]);
    expect(expectedSequence(1,["74.8 MHz","80.0 MHz","94.2 MHz"])).toEqual([3,0,3]);
    expect(expectedSequence(2,["10:00","02:00","09:30"])).toEqual([0,2,1]);
    expect(expectedSequence(3,["180°","90°","270°"])).toEqual([0,3,1]);
  });
  it("does not accept an impossible or unknown chapter",()=>{
    expect(expectedSequence(0,["5 A"])).toEqual([-1,-1,-1]);
    expect(expectedSequence(1,["52 MHz","83.6 MHz","91.8 MHz"])[0]).toBe(-1);
    expect(expectedSequence(8,["0°","90°","180°"])).toEqual([-1,-1,-1]);
    expect(expectedSequence(1,["72.4 junk","83.6 MHz","91.8 MHz"])[0]).toBe(-1);
    expect(expectedSequence(2,["wrong","02:00","09:30"])).toEqual([-1,-1,-1]);
    expect(expectedSequence(3,["90 junk","90°","180°"])[0]).toBe(-1);
  });
});
