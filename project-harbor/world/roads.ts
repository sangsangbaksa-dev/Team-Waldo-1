import { DEPTH, WIDTH, districtAt, roadHalf, type District } from './domain';

export const ROAD_ORIGIN = 64;
export const ROAD_SPACING = 256;
export const SPAWN = { x: 1536, z: 576 };

export interface LaneEdge {
  id: number;
  axis: 'x' | 'z';
  road: number;
  dir: 1 | -1;
  offset: number;
  start: number;
  length: number;
  half: number;
  next: number[];
  crossing: number;
  district: District;
}

export interface LanePose {
  x: number;
  z: number;
  yaw: number;
}

const laneCache: LaneEdge[] = [];

export function roadCenters(limit: number): number[] {
  const centers: number[] = [];
  for (let center = ROAD_ORIGIN; center < limit; center += ROAD_SPACING) centers.push(center);
  return centers;
}

export function laneOffsets(half: number, axis: 'x' | 'z', dir: 1 | -1): number[] {
  const magnitudes = half >= 15 ? [3.4, 9.2] : [2.6];
  const sign = axis === 'z' ? dir : -dir;
  return magnitudes.map(magnitude => sign * magnitude);
}

export function worldForward(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

export function worldRight(yaw: number): { x: number; z: number } {
  const forward = worldForward(yaw);
  return { x: forward.z, z: -forward.x };
}

export function laneYaw(axis: 'x' | 'z', dir: 1 | -1): number {
  if (axis === 'z') return dir > 0 ? Math.PI : 0;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

export function vehicleYawFromWorld(yaw: number): number {
  return Math.atan2(Math.sin(Math.PI - yaw), Math.cos(Math.PI - yaw));
}

export function worldYawFromVehicle(yaw: number): number {
  return Math.atan2(Math.sin(Math.PI - yaw), Math.cos(Math.PI - yaw));
}

export function crossingId(x: number, z: number): number {
  const ix = Math.round((x - ROAD_ORIGIN) / ROAD_SPACING);
  const iz = Math.round((z - ROAD_ORIGIN) / ROAD_SPACING);
  return ix * 64 + iz;
}

export function signalOpen(axis: 'x' | 'z', x: number, z: number, time: number): boolean {
  const ix = Math.round((x - ROAD_ORIGIN) / ROAD_SPACING);
  const iz = Math.round((z - ROAD_ORIGIN) / ROAD_SPACING);
  const phase = ((time + (ix + iz) * 2.3) % 24 + 24) % 24;
  return axis === 'x' ? phase < 10 : phase >= 12 && phase < 22;
}

export function poseOn(edge: LaneEdge, progress: number): LanePose {
  const coord = edge.start + edge.dir * progress;
  const yaw = laneYaw(edge.axis, edge.dir);
  if (edge.axis === 'z') return { x: edge.road + edge.offset, z: coord, yaw };
  return { x: coord, z: edge.road + edge.offset, yaw };
}

export function endPoint(edge: LaneEdge): { x: number; z: number } {
  const pose = poseOn(edge, edge.length);
  return { x: edge.axis === 'z' ? edge.road : pose.x, z: edge.axis === 'z' ? pose.z : edge.road };
}

function edgeKey(axis: 'x' | 'z', road: number, dir: number, offset: number, start: number): string {
  return axis + ':' + road + ':' + dir + ':' + offset.toFixed(2) + ':' + start;
}

export function buildLanes(): LaneEdge[] {
  if (laneCache.length) return laneCache;
  const xs = roadCenters(WIDTH);
  const zs = roadCenters(DEPTH);
  const edges: LaneEdge[] = [];
  const index = new Map<string, number>();
  const add = (axis: 'x' | 'z', road: number, dir: 1 | -1, offset: number, start: number, length: number, half: number) => {
    const pose = poseOn({
      id: edges.length, axis, road, dir, offset, start, length, half, next: [], crossing: 0, district: 'city',
    }, length * 0.5);
    const end = poseOn({
      id: edges.length, axis, road, dir, offset, start, length, half, next: [], crossing: 0, district: 'city',
    }, length);
    const edge: LaneEdge = {
      id: edges.length,
      axis,
      road,
      dir,
      offset,
      start,
      length,
      half,
      next: [],
      crossing: crossingId(axis === 'z' ? road : end.x, axis === 'z' ? end.z : road),
      district: districtAt(pose.x, pose.z).id,
    };
    index.set(edgeKey(axis, road, dir, offset, start), edge.id);
    edges.push(edge);
  };
  for (const x of xs) {
    const half = roadHalf('x', x);
    if (!half) continue;
    for (let i = 0; i < zs.length - 1; i++) {
      const length = zs[i + 1]! - zs[i]!;
      for (const dir of [1, -1] as const) {
        const start = dir > 0 ? zs[i]! : zs[i + 1]!;
        for (const offset of laneOffsets(half, 'z', dir)) add('z', x, dir, offset, start, length, half);
      }
    }
  }
  for (const z of zs) {
    const half = roadHalf('z', z);
    if (!half) continue;
    for (let i = 0; i < xs.length - 1; i++) {
      const length = xs[i + 1]! - xs[i]!;
      for (const dir of [1, -1] as const) {
        const start = dir > 0 ? xs[i]! : xs[i + 1]!;
        for (const offset of laneOffsets(half, 'x', dir)) add('x', z, dir, offset, start, length, half);
      }
    }
  }
  for (const edge of edges) {
    const end = edge.start + edge.dir * edge.length;
    const straight = index.get(edgeKey(edge.axis, edge.road, edge.dir, edge.offset, end));
    if (straight !== undefined) edge.next.push(straight);
    if (edge.axis === 'z') {
      const z = end;
      const onto = roadHalf('z', z);
      if (!onto) continue;
      const rightDir = edge.dir;
      const leftDir = (edge.dir > 0 ? -1 : 1) as 1 | -1;
      linkTurn(index, edge, 'x', z, rightDir, laneOffsets(onto, 'x', rightDir)[0]!, edge.road);
      linkTurn(index, edge, 'x', z, leftDir, laneOffsets(onto, 'x', leftDir)[0]!, edge.road);
    } else {
      const x = end;
      const onto = roadHalf('x', x);
      if (!onto) continue;
      const rightDir = (edge.dir > 0 ? -1 : 1) as 1 | -1;
      const leftDir = edge.dir;
      linkTurn(index, edge, 'z', x, rightDir, laneOffsets(onto, 'z', rightDir)[0]!, edge.road);
      linkTurn(index, edge, 'z', x, leftDir, laneOffsets(onto, 'z', leftDir)[0]!, edge.road);
    }
  }
  laneCache.push(...edges);
  return laneCache;
}

function linkTurn(index: Map<string, number>, edge: LaneEdge, axis: 'x' | 'z', road: number, dir: 1 | -1, offset: number, start: number) {
  const id = index.get(edgeKey(axis, road, dir, offset, start));
  if (id !== undefined) edge.next.push(id);
}

export function nearestLane(edges: readonly LaneEdge[], x: number, z: number): { edge: LaneEdge; progress: number } | null {
  let best: LaneEdge | null = null;
  let progress = 0;
  let score = 14;
  for (const edge of edges) {
    const alongCoord = edge.axis === 'z' ? z : x;
    const cross = edge.axis === 'z' ? x : z;
    const along = (alongCoord - edge.start) * edge.dir;
    if (along < -6 || along > edge.length + 6) continue;
    const lateral = Math.abs(cross - (edge.road + edge.offset));
    const penalty = lateral + Math.max(0, -along) + Math.max(0, along - edge.length);
    if (penalty < score) {
      score = penalty;
      best = edge;
      progress = Math.max(0, Math.min(edge.length, along));
    }
  }
  return best ? { edge: best, progress } : null;
}
