// Exact footprint subtraction for transparent exterior ground decals.
// Work in world XZ while interpolating the original texture coordinates.
export interface Footprint { x: number; z: number; w: number; d: number }
interface Vertex { x: number; z: number; u: number; v: number }
type Axis = 'x' | 'z';
export const FLOOR_Y = 0.075;
function clip(poly: Vertex[], axis: Axis, edge: number, greater: boolean): Vertex[] {
  const out: Vertex[] = [];
  const inside = (p: Vertex): boolean => greater ? p[axis] >= edge : p[axis] <= edge;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ai = inside(a), bi = inside(b);
    if (ai) out.push(a);
    if (ai !== bi) {
      const t = (edge - a[axis]) / (b[axis] - a[axis]);
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, [axis]: edge });
    }
  }
  return out;
}
function area(poly: Vertex[]): number {
  let a = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const p = poly[0], q = poly[i], r = poly[i + 1];
    a += (q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z);
  }
  return a / 2;
}
export function exteriorSurface(x: number, z: number, w: number, d: number, angle: number, buildings: readonly Footprint[]): { positions: number[]; uvs: number[] } {
  const c = Math.cos(angle), s = Math.sin(angle);
  const at = (u: number, v: number): Vertex => {
    const a = (u - .5) * w, b = (.5 - v) * d;
    return { x: x + a * c + b * s, z: z - a * s + b * c, u, v };
  };
  let polys = [[at(0, 1), at(0, 0), at(1, 0), at(1, 1)]];
  const rx = (Math.abs(c) * w + Math.abs(s) * d) / 2, rz = (Math.abs(s) * w + Math.abs(c) * d) / 2;
  for (const b of buildings) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    if (x1 <= x - rx || x0 >= x + rx || z1 <= z - rz || z0 >= z + rz) continue;
    const next: Vertex[][] = [];
    for (const poly of polys) {
      // Four disjoint strips outside the footprint; discard the remaining interior.
      let middle = poly;
      for (const [axis, edge, greater] of [['x', x0, true], ['x', x1, false], ['z', z0, true], ['z', z1, false]] as const) {
        const outside = clip(middle, axis, edge, !greater);
        if (outside.length >= 3 && area(outside) > 1e-8) next.push(outside);
        middle = clip(middle, axis, edge, greater);
        if (middle.length < 3 || area(middle) <= 1e-8) break;
      }
    }
    polys = next;
    if (!polys.length) break;
  }
  const positions: number[] = [], uvs: number[] = [];
  for (const p of polys) for (let i = 1; i + 1 < p.length; i++) {
    const triangle = [p[0], p[i], p[i + 1]];
    if (area(triangle) <= 1e-8) continue;
    for (const q of triangle) { positions.push(q.x, 0, q.z); uvs.push(q.u, q.v); }
  }
  return { positions, uvs };
}
