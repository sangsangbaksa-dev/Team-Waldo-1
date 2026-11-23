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

describe("ROOM TONE independent geometry-ray oracle", () => {
  // A separate segment-versus-rectangle implementation catches symmetrical
  // false positives in the supercover grid traversal.
  const intersects = (a:{x:number;z:number}, b:{x:number;z:number},
    xmin:number,xmax:number,zmin:number,zmax:number) => {
    let lower=0,upper=1;
    for(const [start,delta,low,high] of [
      [a.x,b.x-a.x,xmin,xmax],[a.z,b.z-a.z,zmin,zmax],
    ]){
      if(Math.abs(delta)<1e-12) {
        if(start<low||start>high)return false;
      } else {
        const t1=(low-start)/delta,t2=(high-start)/delta;
        lower=Math.max(lower,Math.min(t1,t2));
        upper=Math.min(upper,Math.max(t1,t2));
        if(lower>upper)return false;
      }
    }
    return true;
  };
  it("agrees with world-space wall rectangles on all four chapters", () => {
    let seed=20041;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      return seed/4294967296;};
    const C=2.7;
    for(let chapter=0;chapter<4;chapter++){
      const level=makeLevel(chapter);
      for(let sample=0;sample<128;sample++){
        const pick=()=> {
          const id=level.reachable[Math.floor(random()*level.reachable.length)];
          return {x:(id%level.w+random()*0.82-0.41)*C,
            z:(Math.floor(id/level.w)+random()*0.82-0.41)*C};
        };
        const a=pick(),b=pick();
        let blocked=false;
        for(let z=0;z<level.map.length&&!blocked;z++)
          for(let x=0;x<level.w;x++)
            if(level.map[z][x]==="#" &&
                intersects(a,b,(x-0.5)*C,(x+0.5)*C,(z-0.5)*C,(z+0.5)*C)){
              blocked=true;
              break;
            }
        expect(lineClear(level.map,C,a,b)).toBe(!blocked);
      }
    }
  });
});
