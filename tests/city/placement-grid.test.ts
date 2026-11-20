import { describe, expect, it } from 'vitest';
import { addSolid, emptyMap, rectFree, rectHitsRoad, removeSolid, solidAt, SOLID_CLEARANCE } from '../../src/city/map';
import { ROAD, SIZE } from '../../src/city/defs';

describe('LAST CITY placement grid', () => {
  it('matches full obstacle scans, including padding and removed solids', () => {
    const map = emptyMap(), ids: number[] = [];
    for (let i = 0; i < 36; i++) ids.push(addSolid(map, { x: ROAD + (i * 157) % (SIZE - ROAD - 200), y: ROAD + (i * 211) % (SIZE - ROAD - 200), w: 80, h: 105, height: 1, wall: '#000', roof: '#000', struct: 0, alive: true }));
    const check = (x: number, y: number, w: number, h: number): boolean =>
      x >= 20 && y >= 20 && x + w <= SIZE - 20 && y + h <= SIZE - 20 && !rectHitsRoad(x,y,w,h) &&
      !map.solids.some(s => s.alive && x < s.x + s.w + SOLID_CLEARANCE && x+w > s.x-SOLID_CLEARANCE && y < s.y+s.h+SOLID_CLEARANCE && y+h > s.y-SOLID_CLEARANCE);
    for (let pass = 0; pass < 2; pass++) {
      for (let i=0; i<300; i++) {
        const x=ROAD+(i*73)%(SIZE-ROAD), y=ROAD+(i*139)%(SIZE-ROAD);
        expect(rectFree(map,x,y,75,90)).toBe(check(x,y,75,90));
      }
      for (const s of map.solids) expect(rectFree(map,s.x+s.w+SOLID_CLEARANCE-1,s.y,32,32)).toBe(check(s.x+s.w+SOLID_CLEARANCE-1,s.y,32,32));
      if (!pass) for (const id of ids.filter((_,i)=>i%2===0)) removeSolid(map,id);
    }
  });
  it('rejects invalid placement geometry', () => {
    const map=emptyMap(); expect(rectFree(map,NaN,300,60,60)).toBe(false);
    expect(rectFree(map,300,300,-1,60)).toBe(false); expect(solidAt(map,NaN,300)).toBeNull();
  });
});
