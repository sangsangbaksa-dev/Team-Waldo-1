import type { District } from './domain';
import { endPoint, poseOn, signalOpen, type LaneEdge } from './roads';

export const DISTRICT_CAP: Record<District, number> = {
  forest: 3,
  desert: 4,
  city: 10,
  rich: 6,
  slum: 8,
  base: 4,
};

export const SIM_STEP = 1 / 60;
export const NEAR_LOD = 80;
export const MID_LOD = 180;
export const FAR_LOD = 320;

export type TrafficKind = 'civil' | 'police' | 'military' | 'block';
export type TrafficMode = 'lane' | 'follow' | 'hold' | 'cross' | 'panic' | 'wreck' | 'chase' | 'search' | 'withdraw' | 'sleep';
export type Lod = 'near' | 'mid' | 'far' | 'sleep';

export interface TrafficCar {
  id: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  vx: number;
  vz: number;
  edge: number;
  progress: number;
  kind: TrafficKind;
  control: 'ai' | 'reserved' | 'player' | 'pursuit';
  mode: TrafficMode;
  occupied: boolean;
  parked: boolean;
  door: number;
  health: number;
  panic: number;
  wait: number;
  cruise: number;
  length: number;
  width: number;
  color: number;
  persistent: boolean;
  lod: Lod;
  type: string;
  drift: number;
}

export interface TrafficNeighbor {
  id: number;
  gap: number;
  speed: number;
  sameLane: boolean;
}

export interface Reservation {
  signal: number;
  carId: number;
  time: number;
}

export interface TrafficSignals {
  claim: boolean;
  release: boolean;
}

export function lodOf(distance: number, persistent: boolean): Lod {
  if (persistent) return distance > 220 ? 'mid' : 'near';
  if (distance > FAR_LOD) return 'sleep';
  if (distance > MID_LOD) return 'far';
  if (distance > NEAR_LOD) return 'mid';
  return 'near';
}

export class SpatialHash {
  private readonly bins = new Map<number, number[]>();

  constructor(private readonly cell = 24) {}

  clear() {
    this.bins.clear();
  }

  insert(index: number, x: number, z: number) {
    const key = this.key(x, z);
    const list = this.bins.get(key);
    if (list) list.push(index);
    else this.bins.set(key, [index]);
  }

  around(x: number, z: number, radius: number): number[] {
    const reach = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    const found: number[] = [];
    for (let i = cx - reach; i <= cx + reach; i++) {
      for (let j = cz - reach; j <= cz + reach; j++) {
        const list = this.bins.get(i * 73856093 ^ j * 19349663);
        if (list) found.push(...list);
      }
    }
    return found;
  }

  private key(x: number, z: number): number {
    return Math.floor(x / this.cell) * 73856093 ^ Math.floor(z / this.cell) * 19349663;
  }
}

export function claimSignal(list: Reservation[], signal: number, carId: number, now: number, moving = true, limit = 5): boolean {
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i];
    if (!entry || now - entry.time <= limit) continue;
    list.splice(i, 1);
  }
  const holders = list.filter(entry => entry.signal === signal);
  const own = holders.find(entry => entry.carId === carId);
  if (own) {
    if (moving) own.time = now;
    return true;
  }
  if (holders.length > 0) return false;
  list.push({ signal, carId, time: now });
  return true;
}

export function releaseSignal(list: Reservation[], carId: number) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.carId === carId) list.splice(i, 1);
}

export function separateCars(a: TrafficCar, b: TrafficCar): boolean {
  let dx = b.x - a.x;
  let dz = b.z - a.z;
  let dist = Math.hypot(dx, dz);
  const min = (a.length + b.length) * 0.28;
  if (dist >= min) return false;
  if (dist < 1e-4) {
    dx = 1;
    dz = 0;
    dist = 1;
  }
  const nx = dx / dist;
  const nz = dz / dist;
  const push = (min - dist) * 0.5;
  if (a.control !== 'player') { a.x -= nx * push; a.z -= nz * push; }
  if (b.control !== 'player') { b.x += nx * push; b.z += nz * push; }
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing > 0) {
    a.health = Math.max(0, a.health - closing * 0.35);
    b.health = Math.max(0, b.health - closing * 0.35);
    if (a.control === 'player') { a.vx -= nx * closing * .55; a.vz -= nz * closing * .55; }
    if (b.control === 'player') { b.vx += nx * closing * .55; b.vz += nz * closing * .55; }
    a.panic = Math.max(a.panic, 2.5);
    b.panic = Math.max(b.panic, 2.5);
    if (a.parked) a.parked = false;
    if (b.parked) b.parked = false;
  }
  return true;
}

function approachSpeed(target: number, remain: number): number {
  return Math.min(target, Math.max(0, (remain - 5.5) * 0.85));
}

export function stepTraffic(
  car: TrafficCar,
  edge: LaneEdge,
  edges: readonly LaneEdge[],
  neighbors: readonly TrafficNeighbor[],
  reserved: boolean,
  playerAhead: boolean,
  playerClose: boolean,
  alarm: boolean,
  time: number,
  dt: number,
): TrafficSignals {
  const signals: TrafficSignals = { claim: false, release: false };
  car.lod = car.lod || 'near';
  if (car.health <= 0) {
    car.mode = 'wreck';
    car.speed += (0 - car.speed) * (1 - Math.exp(-3 * dt));
    car.panic = 0;
    moveAlong(car, edge, edges, dt);
    return signals;
  }
  if (car.parked && car.control === 'ai' && car.panic <= 0 && !alarm) {
    car.mode = 'hold';
    car.speed = 0;
    car.vx = 0;
    car.vz = 0;
    publish(car, edge);
    return signals;
  }
  if (car.lod === 'sleep') {
    car.mode = 'sleep';
    car.speed = car.cruise;
    moveAlong(car, edge, edges, dt);
    return signals;
  }
  if (car.panic > 0 || alarm) {
    car.panic = Math.max(0, car.panic - dt);
    car.mode = 'panic';
    car.parked = false;
    car.drift = Math.min(2.4, car.drift + dt * 1.6);
    const target = car.cruise * 1.15;
    car.speed += (target - car.speed) * (1 - Math.exp(-2.2 * dt));
    moveAlong(car, edge, edges, dt);
    return signals;
  }
  car.drift = Math.max(0, car.drift - dt);
  let target = car.cruise;
  let ahead: TrafficNeighbor | undefined;
  for (const neighbor of neighbors) {
    if (!neighbor.sameLane || neighbor.gap <= 0 || neighbor.gap >= 30) continue;
    if (!ahead || neighbor.gap < ahead.gap) ahead = neighbor;
  }
  if (ahead) {
    target = Math.min(target, Math.max(0, (ahead.gap - 6.2) * 0.8));
    car.mode = 'follow';
  } else car.mode = 'lane';
  if (playerAhead) target = Math.min(target, playerClose ? 0 : 3.5);
  const remain = edge.length - car.progress;
  const end = endPoint(edge);
  const open = signalOpen(edge.axis, end.x, end.z, time) || car.wait > 6;
  if (remain < 24) {
    if (!open || !reserved) {
      target = approachSpeed(target, remain);
      car.mode = 'hold';
      car.wait += dt;
      signals.claim = open;
    } else {
      car.mode = 'cross';
      car.wait = 0;
      signals.claim = true;
    }
  } else if (car.progress > 8) {
    signals.release = true;
    car.wait = 0;
  }
  if (car.lod === 'far') target = Math.min(target, car.cruise);
  car.speed += (target - car.speed) * (1 - Math.exp(-2.4 * dt));
  moveAlong(car, edge, edges, dt);
  return signals;
}

function moveAlong(car: TrafficCar, edge: LaneEdge, edges: readonly LaneEdge[], dt: number) {
  car.progress += car.speed * dt;
  let guard = 0;
  let current = edge;
  while (car.progress >= current.length && guard < 4) {
    car.progress -= current.length;
    const nextId = chooseNext(current, car);
    const next = edges[nextId];
    if (!next) break;
    car.edge = next.id;
    current = next;
    guard += 1;
  }
  publish(car, edges[car.edge] ?? current);
}

function chooseNext(edge: LaneEdge, car: TrafficCar): number {
  if (!edge.next.length) return edge.id;
  if (car.mode === 'panic' && edge.next.length > 1) return edge.next[1] ?? edge.next[0]!;
  return edge.next[0]!;
}

function publish(car: TrafficCar, edge: LaneEdge) {
  const pose = poseOn(edge, Math.max(0, Math.min(edge.length, car.progress)));
  const lateral = car.drift;
  const yaw = pose.yaw;
  car.yaw = yaw;
  car.x = pose.x + Math.cos(yaw) * lateral;
  car.z = pose.z + Math.sin(yaw) * lateral;
  const fx = Math.sin(yaw);
  const fz = -Math.cos(yaw);
  car.vx = fx * car.speed;
  car.vz = fz * car.speed;
}

export function neighborsOnLane(cars: readonly TrafficCar[], index: number, edges: readonly LaneEdge[]): TrafficNeighbor[] {
  const car = cars[index];
  if (!car) return [];
  const edge = edges[car.edge];
  if (!edge) return [];
  const found: TrafficNeighbor[] = [];
  for (let otherIndex = 0; otherIndex < cars.length; otherIndex++) {
    if (otherIndex === index) continue;
    const other = cars[otherIndex];
    if (!other || other.health <= 0) continue;
    if (other.edge === car.edge) {
      found.push({ id: other.id, gap: other.progress - car.progress, speed: other.speed, sameLane: true });
    } else if (edge.next.includes(other.edge)) {
      found.push({
        id: other.id,
        gap: edge.length - car.progress + other.progress,
        speed: other.speed,
        sameLane: true,
      });
    }
  }
  return found;
}
