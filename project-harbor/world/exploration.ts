import { DEPTH, DISTRICTS, WIDTH, type District } from './domain';
import { ROAD_ORIGIN, ROAD_SPACING } from './roads';

export interface Point { x: number; z: number }
export interface Jump { elapsed: number; height: number }
export const JUMP_DURATION = 0.85;
export function groundedJump(): Jump { return { elapsed: JUMP_DURATION, height: 0 }; }
export function stepJump(jump: Jump, dt: number, pressed: boolean, enabled: boolean): Jump {
  if (!enabled) return groundedJump();
  const start = pressed && jump.elapsed >= JUMP_DURATION ? 0 : jump.elapsed;
  const elapsed = Math.min(JUMP_DURATION, start + Math.max(0, Math.min(dt, 0.05)));
  const phase = elapsed / JUMP_DURATION;
  return { elapsed, height: Math.max(0, 4 * 1.35 * phase * (1 - phase)) };
}
export function mapPoint(px: number, py: number, width: number, height: number): Point | null {
  if (![px, py, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const scale = Math.min(width / WIDTH, height / DEPTH);
  const x = (px - (width - WIDTH * scale) / 2) / scale;
  const z = (py - (height - DEPTH * scale) / 2) / scale;
  return x >= 0 && x <= WIDTH && z >= 0 && z <= DEPTH ? { x, z } : null;
}
function road(value: number, limit: number): number {
  const last = Math.floor((limit - 1 - ROAD_ORIGIN) / ROAD_SPACING);
  return ROAD_ORIGIN + Math.max(0, Math.min(last, Math.round((value - ROAD_ORIGIN) / ROAD_SPACING))) * ROAD_SPACING;
}
export function roadGuide(from: Point, to: Point): Point[] {
  const endpoints = (p: Point): Point[] => [{ x: road(p.x, WIDTH), z: p.z }, { x: p.x, z: road(p.z, DEPTH) }];
  let best: Point[] = [from, to], bestCost = Infinity;
  const a = endpoints(from), b = endpoints(to);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const start = a[i]!, end = b[j]!;
    const sx = road(start.x, WIDTH), sz = road(start.z, DEPTH);
    const sameStreet = i === j && (i === 0 ? start.x === end.x : start.z === end.z);
    const points = sameStreet ? [from, start, end, to] : i === 0 && j === 1 ? [from, start, { x: start.x, z: end.z }, end, to]
      : i === 1 && j === 0 ? [from, start, { x: end.x, z: start.z }, end, to]
      : i === 0 ? [from, start, { x: start.x, z: sz }, { x: end.x, z: sz }, end, to]
      : [from, start, { x: sx, z: start.z }, { x: sx, z: end.z }, end, to];
    // Penalize off-road approaches; the internal segments follow the street grid.
    let cost = 0;
    for (let k = 1; k < points.length; k++) {
      const prev = points[k - 1]!, next = points[k]!;
      cost += Math.hypot(next.x - prev.x, next.z - prev.z) * (k === 1 || k === points.length - 1 ? 1.6 : 1);
    }
    if (cost === 0) return [from, to];
    if (cost < bestCost) { bestCost = cost; best = points; }
  }
  return best.filter((point, index) => !index || point.x !== best[index - 1]!.x || point.z !== best[index - 1]!.z);
}

export interface Package extends Point { id: string; district: District; reward: number }
export const PACKAGES: readonly Package[] = DISTRICTS.flatMap(d => [
  { id: d.id + ':north', district: d.id, x: d.x - 192 + 4, z: d.z - 332, reward: 100 },
  { id: d.id + ':south', district: d.id, x: d.x + 320 - 4, z: d.z + 332, reward: 150 },
]);
export function findPackage(at: Point, collected: ReadonlySet<string>, onFoot: boolean): Package | null {
  if (!onFoot) return null;
  return PACKAGES.find(item => !collected.has(item.id) && Math.hypot(item.x - at.x, item.z - at.z) <= 2.8) ?? null;
}
