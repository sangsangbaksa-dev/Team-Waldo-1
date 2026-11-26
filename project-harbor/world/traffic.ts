import { CHUNK, DEPTH, WIDTH, blocked, districtAt, propsFor, roadDistance, roadHalf, type WorldProp } from './domain';
import {
  angleDelta, clamp, collide, forward, hitWall, longitudinal, makeVehicle, stepVehicle,
  type VehicleBody, type VehicleInput,
} from '../vehicles/domain.js';

export interface TrafficOrder {
  axis: 'x' | 'z';
  road: number;
  dir: 1 | -1;
  cruise: number;
  lane: number;
}

export interface Ride extends VehicleBody {
  traffic: TrafficOrder | null;
}

const ENTER_GAP = 6;
const SEEK_GAP = 18;
const TYPES = ['sedan', 'sport', 'truck', 'bike', 'jeep'] as const;

function centers(start: number, span: number, limit: number): number[] {
  const list: number[] = [];
  let cursor = Math.ceil((start - 64) / 256) * 256 + 64;
  const end = Math.min(limit, start + span);
  for (; cursor >= 0 && cursor < end; cursor += 256) list.push(cursor);
  return list;
}

function modelFor(x: number, z: number, rand: () => number): string {
  const id = districtAt(x, z).id;
  if (id === 'base') return 'jeep';
  if (id === 'rich') return rand() < 0.65 ? 'sport' : 'sedan';
  if (id === 'desert' || id === 'forest') return rand() < 0.5 ? 'jeep' : 'truck';
  return TYPES[Math.floor(rand() * 4)] ?? 'sedan';
}

export function surfaceGap(ride: Ride, x: number, z: number): number {
  return Math.hypot(ride.x - x, ride.z - z) - ride.spec.width / 2;
}

export function nearestRide(rides: readonly Ride[], x: number, z: number, range: number): Ride | null {
  let best: Ride | null = null;
  let gap = range;
  for (const ride of rides) {
    const next = surfaceGap(ride, x, z);
    if (next < gap) { best = ride; gap = next; }
  }
  return best;
}

export interface RoadHazard { x: number; z: number; panic?: boolean }

export function cruiseInput(ride: Ride, others: readonly Ride[], hazards: readonly RoadHazard[] = []): VehicleInput & { horn: number } {
  const order = ride.traffic;
  if (!order) return { throttle: 0, steer: 0, handbrake: true, horn: 0 };
  const axis = order.axis;
  const cross = axis === 'x' ? 'z' : 'x';
  const along = axis === 'z' ? (order.dir > 0 ? 0 : Math.PI) : (order.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const laneError = order.road + order.lane - ride[cross];
  const crossSign = axis === 'z' ? order.dir : -order.dir;
  let swerve = 0;
  let target = order.cruise;
  let horn = 0;
  for (const other of others) {
    if (other === ride) continue;
    const gap = (other[axis] - ride[axis]) * order.dir;
    const side = Math.abs(other[cross] - ride[cross]);
    if (gap > 0 && gap < 26 && side < 3.4) target = Math.min(target, Math.max(0, (gap - 7) * 0.8));
  }
  for (const hazard of hazards) {
    const senseAlong = axis === 'x' ? hazard.x : hazard.z;
    const senseFixed = axis === 'x' ? hazard.z : hazard.x;
    const gap = (senseAlong - ride[axis]) * order.dir;
    const side = Math.abs(senseFixed - ride[cross]);
    if (hazard.panic && gap > -4 && gap < 18 && side < 8) target = Math.min(target, 2);
    else if (gap > 0 && gap < 16 && side < 3.2) {
      target = Math.min(target, Math.max(0, (gap - 4) * 0.55));
      if (gap < 13) horn = 1;
    } else if (gap > 0 && gap < 22 && side < 4.2) {
      target = Math.min(target, 6);
      horn = 1;
    } else if (Math.abs(gap) < 7 && side > 1.2 && side < 5) swerve = Math.sign(ride[cross] - senseFixed) || 1;
  }
  const correction = clamp(laneError * 0.12 + swerve * 0.2, -0.4, 0.4) * crossSign;
  const error = angleDelta(along + correction, ride.yaw);
  const speed = longitudinal(ride);
  return {
    throttle: clamp((target - speed) * 0.45, -1, 1),
    steer: clamp(error * 2.4, -1, 1),
    handbrake: target < 0.2 && Math.abs(speed) < 0.8,
    horn,
  };
}

function hash(cx: number, cz: number): () => number {
  let s = (Math.imul(cx + 19, 73856093) ^ Math.imul(cz + 53, 19349663) ^ 0x6d2b79f5) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export class CityTraffic {
  readonly rides: Ride[] = [];
  occupied: Ride | null = null;
  seeking: Ride | null = null;
  seekLeft = 0;
  private nextId = 1;
  private readonly born = new Set<string>();

  ensure(x: number, z: number) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let i = cx - 2; i <= cx + 2; i++) {
      for (let j = cz - 2; j <= cz + 2; j++) {
        if (i < 0 || j < 0 || i >= WIDTH / CHUNK || j >= DEPTH / CHUNK) continue;
        const key = i + ':' + j;
        if (this.born.has(key) || this.rides.length > 36) continue;
        this.born.add(key);
        this.spawnChunk(i, j, x, z);
      }
    }
  }

  seedStarter(x: number, z: number) {
    if (nearestRide(this.rides, x, z, 22)) return;
    const ride = makeVehicle(this.nextId++, 'sedan', x + 9, z - 1.6, Math.PI / 2, false) as Ride;
    ride.traffic = null;
    this.rides.push(ride);
  }

  nearest(x: number, z: number, range: number) {
    return nearestRide(this.rides, x, z, range);
  }

  claim(ride: Ride): boolean {
    const stolen = ride.driver;
    ride.driver = false;
    ride.traffic = null;
    ride.vx *= 0.2;
    ride.vz *= 0.2;
    this.occupied = ride;
    this.seeking = null;
    this.seekLeft = 0;
    return stolen;
  }

  leave(findSpot: (x: number, z: number) => { x: number; z: number } | null): 'fast' | 'blocked' | { x: number; z: number } {
    const ride = this.occupied;
    if (!ride) return 'blocked';
    if (Math.abs(longitudinal(ride)) > 4) return 'fast';
    const nose = forward(ride.yaw);
    const reach = ride.spec.width / 2 + 1.6;
    const spot = findSpot(ride.x + nose.z * reach, ride.z - nose.x * reach)
      ?? findSpot(ride.x - nose.z * reach, ride.z + nose.x * reach);
    if (!spot) return 'blocked';
    this.occupied = null;
    return spot;
  }

  seekToward(x: number, z: number, dt: number): { x: number; z: number } | null {
    const ride = this.seeking;
    if (!ride) return null;
    this.seekLeft = Math.max(0, this.seekLeft - dt);
    if (this.seekLeft === 0) { this.seeking = null; return null; }
    const dx = ride.x - x;
    const dz = ride.z - z;
    const dist = Math.hypot(dx, dz) || 1;
    const step = Math.min(dist, 12 * dt);
    return { x: x + dx / dist * step, z: z + dz / dist * step };
  }

  overlaps(x: number, z: number, ignore: Ride | null = this.occupied): boolean {
    return this.rides.some(ride => ride !== ignore && Math.hypot(ride.x - x, ride.z - z) < Math.max(ride.spec.length, ride.spec.width) * 0.42 + 0.55);
  }

  step(x: number, z: number, dt: number, drive: VehicleInput | null, propsAt: (x: number, z: number) => readonly WorldProp[], hazards: readonly RoadHazard[] = []) {
    const horns: { x: number; z: number }[] = [];
    const active = this.rides.filter(ride => ride === this.occupied || Math.abs(ride.x - x) < 280 && Math.abs(ride.z - z) < 280);
    for (const ride of active) {
      const cruise = ride.driver && ride.traffic ? cruiseInput(ride, active, hazards) : null;
      const input = ride === this.occupied && drive
        ? drive
        : cruise
          ? cruise
          : { throttle: 0, steer: 0, handbrake: true };
      if (cruise?.horn) horns.push({ x: ride.x, z: ride.z });
      stepVehicle(ride, input, dt, roadDistance(ride.x, ride.z) > 1.2);
      for (const prop of propsAt(ride.x, ride.z)) hitWall(ride, prop);
      this.keepInside(ride);
    }
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        if (a && b && Math.abs(a.x - b.x) < 12 && Math.abs(a.z - b.z) < 12) collide(a, b);
      }
    }
    const car = this.occupied;
    if (car) this.keepInside(car);
    return horns;
  }

  private keepInside(ride: Ride) {
    if (ride.x < 8 || ride.x > WIDTH - 8) {
      ride.vx *= -0.35;
      ride.x = clamp(ride.x, 8, WIDTH - 8);
      if (ride.traffic?.axis === 'x') ride.traffic.dir = ride.x < WIDTH / 2 ? 1 : -1;
    }
    if (ride.z < 8 || ride.z > DEPTH - 8) {
      ride.vz *= -0.35;
      ride.z = clamp(ride.z, 8, DEPTH - 8);
      if (ride.traffic?.axis === 'z') ride.traffic.dir = ride.z < DEPTH / 2 ? 1 : -1;
    }
  }

  private spawnChunk(cx: number, cz: number, playerX: number, playerZ: number) {
    const rand = hash(cx, cz);
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const props = propsFor(cx, cz);
    const place = (x: number, z: number, yaw: number, type: string, driver: boolean, traffic: TrafficOrder | null) => {
      if (this.rides.length > 36) return;
      if (x < 8 || z < 8 || x > WIDTH - 8 || z > DEPTH - 8) return;
      if (Math.hypot(x - playerX, z - playerZ) < 14) return;
      if (roadDistance(x, z) > 0.2 || blocked(x, z, props, 1.4)) return;
      if (this.rides.some(ride => Math.hypot(ride.x - x, ride.z - z) < 8)) return;
      const ride = makeVehicle(this.nextId++, type, x, z, yaw, driver) as Ride;
      ride.traffic = traffic;
      this.rides.push(ride);
    };
    for (const road of centers(x0, CHUNK, WIDTH)) {
      const lane = Math.min(3.1, roadHalf('x', road) * 0.45);
      const z = z0 + 28 + rand() * 72;
      if (rand() < 0.7) place(road + lane, z, rand() < 0.5 ? 0 : Math.PI, modelFor(road, z, rand), false, null);
      if (rand() < 0.5) {
        const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
        place(road - lane, z0 + 24 + rand() * 70, dir > 0 ? 0 : Math.PI, modelFor(road, z, rand), true, {
          axis: 'z', road, dir, cruise: 9 + rand() * 6, lane: -lane,
        });
      }
    }
    for (const road of centers(z0, CHUNK, DEPTH)) {
      const lane = Math.min(3.1, roadHalf('z', road) * 0.45);
      const x = x0 + 28 + rand() * 72;
      if (rand() < 0.7) place(x, road + lane, rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2, modelFor(x, road, rand), false, null);
      if (rand() < 0.5) {
        const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
        place(x0 + 24 + rand() * 70, road - lane, dir > 0 ? Math.PI / 2 : -Math.PI / 2, modelFor(x, road, rand), true, {
          axis: 'x', road, dir, cruise: 9 + rand() * 6, lane: -lane,
        });
      }
    }
  }
}

export const ENTER_RANGE = ENTER_GAP;
export const SEEK_RANGE = SEEK_GAP;
