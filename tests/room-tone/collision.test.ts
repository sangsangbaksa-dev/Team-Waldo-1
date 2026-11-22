import { describe,expect,it } from "vitest";
import { canOccupy,moveWithCollision,lineOfSight } from "../../src/room-tone/collision.mjs";
const C=2.7;
const map=["#####","#...#","#.#.#","#...#","#####"];
describe("ROOM TONE grid collision and visibility",()=>{
  it("accepts open cells, including a safe player footprint",()=>{
    expect(canOccupy(map,C,C,C)).toBe(true);
    expect(canOccupy(map,C,C,C,0.225)).toBe(true);
    expect(canOccupy(map,C,2*C,2*C)).toBe(false);
  });
  it("rejects wall corners before the player's radius clips a solid tile",()=>{
    expect(canOccupy(map,C,1.5,C,0.225)).toBe(false);
    expect(canOccupy(map,C,-1,C)).toBe(false);
    expect(canOccupy(map,C,NaN,C)).toBe(false);
  });
  it("slides along solid tiles without entering walls",()=>{
    const p={x:2*C,z:C};
    moveWithCollision(map,C,p,0.3,C);
    expect(p.x).toBeCloseTo(2*C+0.3);
    expect(p.z).toBe(C);
  });
  it("moves through a clear corridor and preserves untouched axes",()=>{
    const p={x:C,z:C};
    moveWithCollision(map,C,p,0,0.6*C);
    expect(p.x).toBe(C);
    expect(p.z).toBeCloseTo(C+0.6*C);
  });
  it("blocks line of sight through partitions but not an open corridor",()=>{
    const point=(x:number,z:number)=>({x:x*C,z:z*C});
    expect(lineOfSight(map,C,point(1,1),point(3,1))).toBe(true);
    expect(lineOfSight(map,C,point(2,1),point(2,3))).toBe(false);
    expect(lineOfSight(map,C,point(1,1),point(3,3))).toBe(false);
    expect(lineOfSight(map,C,point(1,1),point(1,1))).toBe(true);
  });
});
