import { describe, expect, it } from "vitest";
import { makeLevel, neighbors } from "../../src/room-tone/levels.mjs";
import { circleHitsProp } from "../../src/room-tone/obstacles.mjs";
import { lineClear } from "../../src/room-tone/visibility.mjs";

const C = 2.7, STEP = 0.45, RADIUS = 0.225;

describe("ROOM TONE four-chapter equipment accessibility", () => {
  for (let chapter = 0; chapter < 4; chapter++) {
    it(`chapter ${chapter+1} remains traversable with real prop footprints`, () => {
      const level = makeLevel(chapter);
      const targetCells = [level.start, ...level.items, level.exit];
      const colliders = targetCells.map((cell, i) => ({
        x: (cell % level.w) * C, z: Math.floor(cell / level.w) * C,
        rotation: 0,
        halfWidth: i===0 ? 0.46 : i===4 ? 0.35 : 0.36,
        halfDepth: i===0 ? 0.30 : i===4 ? 0.22 : 0.25,
      }));
      const distance = (a: number, b: number) => Math.abs(a % level.w-b % level.w) +
        Math.abs(Math.floor(a / level.w)-Math.floor(b / level.w));
      const reserved = [level.start, level.exit, level.nest, ...level.items];
      const candidates = level.reachable.filter(cell => neighbors(level.map, cell).length>=3 &&
        reserved.every(other => distance(cell,other)>2));
      const selected: number[] = [];
      for (const cell of candidates) {
        if (selected.some(other=>distance(cell,other)<5)) continue;
        const x=cell%level.w, z=Math.floor(cell/level.w);
        const wall=[[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dz])=>
          level.map[z+dz]?.[x+dx]==="#");
        if (!wall) continue;
        selected.push(cell);
        const [dx,dz]=wall, kind=(selected.length-1)%4;
        colliders.push({
          x:x*C+dx*0.82,z:z*C+dz*0.82,rotation:Math.atan2(dx,dz),
          halfWidth:0.57,halfDepth:kind===2 ? 0.13 : 0.44,
        });
      }
      const pass = (x:number,z:number) =>
        level.map[Math.floor(z/C+0.5)]?.[Math.floor(x/C+0.5)]===".";
      const free = (x:number,z:number) =>
        [[-1,-1],[1,-1],[-1,1],[1,1]].every(([sx,sz])=>
          pass(x+sx*RADIUS,z+sz*RADIUS)) &&
        !colliders.some(obstacle=>circleHitsProp(x,z,RADIUS,obstacle));
      const next=neighbors(level.map,level.start)[0];
      const x0=(level.start%level.w)*C+
        ((next%level.w)-(level.start%level.w))*C*0.38;
      const z0=Math.floor(level.start/level.w)*C+
        (Math.floor(next/level.w)-Math.floor(level.start/level.w))*C*0.38;
      const first:[number,number]=[Math.round(x0/STEP),Math.round(z0/STEP)];
      expect(free(first[0]*STEP,first[1]*STEP)).toBe(true);
      const width=(level.w-1)*6+1, visited=new Set<number>();
      const queue:[number,number][]=[first];
      visited.add(first[1]*width+first[0]);
      for(let h=0;h<queue.length;h++) {
        const [ix,iz]=queue[h];
        for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const x=ix+dx,z=iz+dz,key=z*width+x;
          if(x<0||x>=width||z<0||z>=width||visited.has(key)||
              !free(x*STEP,z*STEP)) continue;
          visited.add(key);queue.push([x,z]);
        }
      }
      expect(queue.length).toBeGreaterThan(5000);
      for(const cell of targetCells) {
        const target={x:(cell%level.w)*C,z:Math.floor(cell/level.w)*C};
        expect(queue.some(([ix,iz])=>{
          const p={x:ix*STEP,z:iz*STEP};
          return Math.hypot(p.x-target.x,p.z-target.z)<2.16 &&
            lineClear(level.map,C,p,target);
        }),`Cannot approach objective ${cell}`).toBe(true);
      }
    });
  }
});
