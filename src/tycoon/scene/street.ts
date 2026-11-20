import type { Block, Box } from './layout';
import type { GeoBuilder } from './geo';

export type StreetKind = 'bench' | 'recycling' | 'planter' | 'utility' | 'bollards';
export interface StreetProp { x: number; z: number; nx: number; nz: number; kind: StreetKind }
const THEMES: Record<Block['zone'], readonly StreetKind[]> = {
  slum: ['utility', 'recycling'], market: ['bench', 'planter', 'recycling'],
  harbor: ['utility', 'bollards'], downtown: ['planter', 'bench', 'bollards'],
  uptown: ['bench', 'planter'], fringe: ['utility', 'planter'],
};
// At mid-edge, well away from the lot doors (at +/-8) and the corner streetlights.
export function streetProps(b: Block, quality: 'low' | 'standard' | 'high'): StreetProp[] {
  const kinds = THEMES[b.zone], result: StreetProp[] = [];
  const sides = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
  for (let k = 0; k < sides.length; k++) {
    if (quality === 'low' && k % 2 !== 0) continue;
    const [nx, nz] = sides[k];
    const kind = kinds[((b.i * 13 + b.j * 7 + k) % kinds.length + kinds.length) % kinds.length];
    result.push({ x: b.cx + nx * 16.8, z: b.cz + nz * 16.8, nx, nz, kind });
  }
  return result;
}

export function addStreetProps(detail: GeoBuilder, glow: GeoBuilder, b: Block, quality: 'low' | 'standard' | 'high'): Box[] {
  const boxes: Box[] = [];
  for (const p of streetProps(b, quality)) {
    const add = (a: number, y: number, offset: number, w: number, h: number, d: number, color: number, obstacle = false, mat = detail) => {
      const x = p.x + p.nz * a + p.nx * offset, z = p.z - p.nx * a + p.nz * offset, bw = p.nx ? d : w, bd = p.nx ? w : d;
      mat.solid(x, y, z, bw, h, bd, color);
      if (obstacle) boxes.push({ x0: x - bw / 2, x1: x + bw / 2, z0: z - bd / 2, z1: z + bd / 2 });
    };
    if (p.kind === 'bench') {
      add(0, .62, 0, 2.5, .12, .68, 0x896b4c, true);
      add(0, .74, -.28, 2.5, .46, .1, 0xa3825e);
      for (const s of [-1, 1]) add(s * .87, .18, 0, .12, .44, .5, 0x3d484b);
    } else if (p.kind === 'planter') {
      add(0, .18, 0, 2.4, .45, .8, 0x90918b, true);
      add(0, .63, 0, 2.1, .19, .56, 0x537950);
      if (quality !== 'low') for (let i = -2; i <= 2; i++) add(i * .36, .82, 0, .15, .12, .16, i % 2 ? 0xd9ae6f : 0xb57388);
    } else if (p.kind === 'recycling') {
      for (const s of [-1, 1]) {
        add(s * .43, .18, 0, .68, .95, .64, s < 0 ? 0x476e5e : 0x496987, true);
        add(s * .43, 1.13, 0, .76, .10, .72, 0x364349);
        add(s * .43, .94, .34, .36, .09, .04, 0x222b2d);
      }
    } else if (p.kind === 'utility') {
      add(0, .18, 0, 1.18, 1.15, .6, 0x7b8586, true);
      add(0, .91, .32, .9, .12, .04, 0x424d53);
      add(.35, .71, .34, .12, .20, .04, 0x343d40);
      add(-.37, 1.18, .32, .09, .07, .04, 0xeec37b, false, glow);
    } else {
      for (const s of [-1, 1]) {
        add(s * .72, .18, .24, .18, .66, .18, 0x4d5759, true);
        add(s * .72, .69, .24, .21, .09, .21, 0xe7bd58);
      }
    }
  }
  return boxes;
}
