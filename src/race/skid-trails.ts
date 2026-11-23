// SPEED RUSH — frame-rate independent tire-trail sample history.
export interface SkidRun {
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;
  distance: number;
  pieces: number;
}

export class SkidTrailHistory {
  private anchors = new Map<number, [number, number, number]>();
  /** Do not advance anchors on tiny movements, or high-refresh screens never
   * reach the minimum 20cm segment length. A teleport (>28m) resets the run. */
  sample(key: number, x: number, y: number, z: number): SkidRun | null {
    if (![key, x, y, z].every(Number.isFinite)) return null;
    const previous = this.anchors.get(key);
    if (!previous) { this.anchors.set(key, [x, y, z]); return null; }
    const dx = x - previous[0], dy = y - previous[1], dz = z - previous[2];
    const distance = Math.hypot(dx, dz);
    if (distance < 0.2) return null;
    const run: SkidRun = {
      x: previous[0], y: previous[1], z: previous[2],
      dx, dy, dz, distance, pieces: Math.ceil(distance / 3),
    };
    previous[0] = x; previous[1] = y; previous[2] = z;
    return distance > 28 ? null : run;
  }
  lift(key: number): void { this.anchors.delete(key); }
}
