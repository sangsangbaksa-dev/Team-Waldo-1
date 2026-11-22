import { describe, expect, it } from 'vitest';
import { exteriorSurface, FLOOR_Y } from '../../src/shooter/ground-surfaces';
function area(p: number[]): number {
  let n = 0;
  for (let i = 0; i < p.length; i += 9) n += ((p[i+5]-p[i+2])*(p[i+6]-p[i])-(p[i+3]-p[i])*(p[i+8]-p[i+2])) / 2;
  return n;
}
describe('ZERO ZONE ground layers', () => {
  it('preserves a complete upward-facing surface and texture mapping without buildings', () => {
    const a = exteriorSurface(5, 8, 10, 6, .7, []);
    expect(area(a.positions)).toBeCloseTo(60);
    expect(a.uvs.length).toBe(a.positions.length / 3 * 2);
    expect(a.uvs.every(u => u >= -1e-8 && u <= 1+1e-8)).toBe(true);
  });
  it('cuts out the entire building, including for a rotated town pad', () => {
    const b = {x:0,z:0,w:4,d:6};
    for (const angle of [0, .3, 1.5]) {
      const a = exteriorSurface(0,0,20,20,angle,[b]);
      expect(area(a.positions)).toBeCloseTo(376);
      for (let i=0;i<a.positions.length;i+=9) {
        const p=a.positions.slice(i,i+9);
        expect([p[0],p[3],p[6]].every(x=>x<=-2+1e-8)||[p[0],p[3],p[6]].every(x=>x>=2-1e-8)||[p[2],p[5],p[8]].every(z=>z<=-3+1e-8)||[p[2],p[5],p[8]].every(z=>z>=3-1e-8)).toBe(true);
      }
    }
  });
  it('handles overlapping footprints, edge intersections and complete coverage', () => {
    expect(area(exteriorSurface(0,0,10,10,0,[{x:-1,z:0,w:4,d:4},{x:1,z:0,w:4,d:4}]).positions)).toBeCloseTo(76);
    expect(area(exteriorSurface(0,0,10,10,0,[{x:5,z:0,w:4,d:4}]).positions)).toBeCloseTo(92);
    expect(exteriorSurface(0,0,2,2,.3,[{x:0,z:0,w:8,d:8}]).positions).toEqual([]);
    expect(FLOOR_Y).toBeGreaterThan(.04);
  });
});
