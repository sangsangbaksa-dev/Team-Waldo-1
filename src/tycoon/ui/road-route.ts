// HUSTLE — approximate street-based directions for the square city grid.
// Pure geometry; no graph allocation, Three.js, DOM, or persistent state.
import { PITCH } from '../scene/layout';

export interface RoadPoint { x: number; z: number }
const vertical = (x: number): number => Math.round((x - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
const horizontal = (z: number): number => Math.round((z - PITCH / 2) / PITCH) * PITCH + PITCH / 2;
const length = (points: readonly RoadPoint[]): number => points.reduce((sum, p, i) => {
  if (!i) return sum;
  const prev = points[i - 1];
  return sum + Math.hypot(p.x - prev.x, p.z - prev.z);
}, 0);

/** Pick the shorter of vertical-first and horizontal-first street routes. */
export function streetRoute(start: RoadPoint, end: RoadPoint): RoadPoint[] {
  if (start.x === end.x && start.z === end.z) return [start];
  // Straight segments already on a street do not need artificial junction detours.
  if ((start.x === end.x && Math.abs(start.x - vertical(start.x)) < 0.01) ||
      (start.z === end.z && Math.abs(start.z - horizontal(start.z)) < 0.01)) return [start, end];
  const sx = vertical(start.x), sz = horizontal(start.z), tx = vertical(end.x), tz = horizontal(end.z);
  const verticalFirst: RoadPoint[] = [
    start, { x: sx, z: start.z }, { x: sx, z: tz }, { x: end.x, z: tz }, end,
  ];
  const horizontalFirst: RoadPoint[] = [
    start, { x: start.x, z: sz }, { x: tx, z: sz }, { x: tx, z: end.z }, end,
  ];
  const best = length(verticalFirst) <= length(horizontalFirst) ? verticalFirst : horizontalFirst;
  return best.filter((p, i) => !i || p.x !== best[i - 1].x || p.z !== best[i - 1].z);
}

export function streetDistance(start: RoadPoint, end: RoadPoint): number {
  return length(streetRoute(start, end));
}
