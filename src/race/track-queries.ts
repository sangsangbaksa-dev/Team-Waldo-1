// SPEED RUSH — read-only track lookups, independent of Three.js.
// Track sample arrays are immutable after construction.
const curvatureTables = new WeakMap<Float32Array, Float32Array[]>();

/** Exact maximum of |curvature| at offsets 0, 2, ... <= look, including wraparound. */
export function maxLookCurvature(k: Float32Array, start: number, look: number): number {
  const n = k.length;
  if (!n) return 0;
  const cycle = n % 2 === 0 ? n / 2 : n;
  const count = Math.min(cycle, Math.floor(look / 2) + 1);
  if (count <= 0) return 0;
  let levels = curvatureTables.get(k);
  if (!levels) {
    levels = [k.map(Math.abs)];
    curvatureTables.set(k, levels);
  }
  const level = Math.floor(Math.log2(count));
  while (levels.length <= level) {
    const previous = levels[levels.length - 1], offset = 2 ** levels.length;
    const next = new Float32Array(n);
    for (let i = 0; i < n; i++) next[i] = Math.max(previous[i], previous[(i + offset) % n]);
    levels.push(next);
  }
  const table = levels[level], i = ((start % n) + n) % n;
  const tail = (i + 2 * (count - 2 ** level)) % n;
  return Math.max(table[i], table[tail]);
}

interface RoadSamples { x: Float32Array; y: Float32Array; z: Float32Array }
const CELL = 64;
const key = (x: number, z: number): string => x + ':' + z;

/** Static spatial hash for scenery placement. Always uses the original strict
 * distance comparison for candidates; the expanded cell bounds cannot omit
 * a sample whose slope-dependent clearance overlaps the query.
 */
export class TrackClearanceIndex {
  private readonly cells = new Map<string, number[]>();
  private readonly extra: Float64Array;
  private maxExtra = 0;

  constructor(private readonly road: RoadSamples, private readonly stride = 1, slope = true) {
    this.extra = new Float64Array(road.x.length);
    for (let i = 0; i < road.x.length; i += stride) {
      const e = slope ? Math.max(0, road.y[i] * 2.4 - 2) : 0;
      this.extra[i] = e;
      this.maxExtra = Math.max(this.maxExtra, e);
      const id = key(Math.floor(road.x[i] / CELL), Math.floor(road.z[i] / CELL));
      const cell = this.cells.get(id);
      if (cell) cell.push(i); else this.cells.set(id, [i]);
    }
  }

  overlaps(x: number, z: number, need: number): boolean {
    const radius = need + this.maxExtra;
    if (!(radius > 0)) return false;
    const minX = Math.floor((x - radius) / CELL), maxX = Math.floor((x + radius) / CELL);
    const minZ = Math.floor((z - radius) / CELL), maxZ = Math.floor((z + radius) / CELL);
    // Avoid walking a huge empty grid for unusually large scenery.
    if ((maxX - minX + 1) * (maxZ - minZ + 1) > this.road.x.length) {
      for (let i = 0; i < this.road.x.length; i += this.stride) if (this.hits(i, x, z, need)) return true;
      return false;
    }
    for (let cx = minX; cx <= maxX; cx++) for (let cz = minZ; cz <= maxZ; cz++) {
      const cell = this.cells.get(key(cx, cz));
      if (cell) for (const i of cell) if (this.hits(i, x, z, need)) return true;
    }
    return false;
  }

  private hits(i: number, x: number, z: number, need: number): boolean {
    return Math.hypot(this.road.x[i] - x, this.road.z[i] - z) < need + this.extra[i];
  }
}

/** Racing start gantry's sign faces incoming traffic and sits outside its
 * 90cm-deep crossbeam. This keeps the printed texture visible, not z-fighting.
 * yaw rotates the Three.js plane normal (+Z) to -track tangent.
 */
export function startBannerPose(tx: number, tz: number, clearance = 0.65): { yaw: number; dx: number; dz: number } {
  return { yaw: -Math.atan2(tz, tx) - Math.PI / 2, dx: -tx * clearance, dz: -tz * clearance };
}
