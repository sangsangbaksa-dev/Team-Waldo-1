import { DEPTH, WIDTH, districtAt, roadHalf } from '../domain';
import type { Ear } from './audio';
import { bandOf, PROFILES } from './regions';

export interface AmbientCar {
  id: string;
  x: number;
  z: number;
  travel: 'x' | 'z';
  dir: 1 | -1;
  road: number;
  lateral: number;
  offset: number;
  speed: number;
  mode: 'cruise' | 'brake' | 'stop' | 'swerve' | 'panic';
  horn: number;
  yaw: number;
  color: number;
}

export interface Intent {
  target: number;
  offset: number;
  horn: boolean;
  mode: AmbientCar['mode'];
}

function alongOf(car: AmbientCar): number {
  return car.travel === 'x' ? car.x : car.z;
}

function fixedOf(car: AmbientCar): number {
  return car.travel === 'x' ? car.z : car.x;
}

export function driverIntent(car: AmbientCar, points: readonly { x: number; z: number }[], panic: boolean, yieldRoad: boolean): Intent {
  let target = 11;
  let offset = car.lateral;
  let horn = false;
  let mode: AmbientCar['mode'] = 'cruise';
  if (panic) {
    return { target: 4, offset: car.lateral + 2.4, horn: false, mode: 'panic' };
  }
  if (yieldRoad) {
    target = 3;
    offset = car.lateral + 1.8;
    mode = 'swerve';
  }
  for (const point of points) {
    const senseAlong = car.travel === 'x' ? point.x : point.z;
    const senseFixed = car.travel === 'x' ? point.z : point.x;
    const gap = (senseAlong - alongOf(car)) * car.dir;
    const side = Math.abs(senseFixed - fixedOf(car));
    if (gap > 0 && gap < 16 && side < 3.2) {
      target = Math.min(target, Math.max(0, (gap - 4) * 0.55));
      mode = target < 1 ? 'stop' : 'brake';
      if (gap < 13) horn = true;
    } else if (gap > 0 && gap < 24 && side < 4.2) {
      target = Math.min(target, 7);
      horn = true;
      if (mode === 'cruise') mode = 'brake';
    } else if (Math.abs(gap) < 7 && side < 5) {
      const away = Math.sign(fixedOf(car) - senseFixed) || 1;
      offset = car.lateral + away * 2.2;
      mode = mode === 'stop' ? 'stop' : 'swerve';
    }
  }
  return { target, offset, horn, mode };
}

function yawOf(car: AmbientCar): number {
  const fx = car.travel === 'x' ? car.dir : 0;
  const fz = car.travel === 'z' ? car.dir : 0;
  return Math.atan2(fx, fz);
}

function paint(x: number, z: number): number {
  const id = districtAt(x, z).id;
  if (id === 'rich') return 0xd8d2c4;
  if (id === 'base') return 0x66714e;
  if (id === 'desert') return 0xc4a06a;
  if (id === 'slum') return 0x8a7564;
  if (id === 'forest') return 0x5d6b52;
  return 0x527c99;
}

export class AmbientFleet {
  readonly cars: AmbientCar[] = [];
  private key = '';
  private seq = 1;

  ensure(x: number, z: number, hours: number, roll: () => number) {
    const id = districtAt(x, z).id;
    const band = bandOf(hours);
    const key = id + ':' + band;
    const rush = band === 1 || band === 3 ? 1.2 : band === 0 || band === 4 ? 0.45 : 1;
    const want = Math.max(1, Math.min(6, Math.round(4 * PROFILES[id].traffic * rush)));
    if (key !== this.key) {
      this.key = key;
      while (this.cars.length > want) this.cars.pop();
    }
    let guard = 0;
    while (this.cars.length < want && guard < 12) {
      guard += 1;
      this.spawn(x, z, roll);
    }
  }

  private spawn(x: number, z: number, roll: () => number) {
    for (let n = 0; n < 8; n++) {
      const travel = roll() < 0.5 ? 'x' : 'z';
      const base = travel === 'x' ? z : x;
      const road = Math.round((base - 64) / 256) * 256 + 64;
      const half = roadHalf(travel === 'x' ? 'z' : 'x', road);
      if (!half) continue;
      const dir: 1 | -1 = roll() < 0.5 ? 1 : -1;
      const along = (travel === 'x' ? x : z) + dir * (34 + roll() * 36);
      const lateral = Math.min(half - 1.5, 2.4) * (roll() < 0.5 ? 1 : -1);
      const px = travel === 'x' ? along : road + lateral;
      const pz = travel === 'z' ? along : road + lateral;
      if (px < 12 || pz < 12 || px > WIDTH - 12 || pz > DEPTH - 12) continue;
      if (Math.hypot(px - x, pz - z) < 22) continue;
      if (this.cars.some(car => Math.hypot(car.x - px, car.z - pz) < 12)) continue;
      const car: AmbientCar = {
        id: 'car-' + this.seq++, x: px, z: pz, travel, dir, road, lateral, offset: lateral,
        speed: 3 + roll() * 3, mode: 'cruise', horn: 0, yaw: 0, color: paint(px, pz),
      };
      car.yaw = yawOf(car);
      this.cars.push(car);
      return;
    }
  }

  step(
    dt: number,
    playerX: number,
    playerZ: number,
    points: readonly { x: number; z: number }[],
    panicAt: (x: number, z: number) => boolean,
    yieldRoad: boolean,
    blocked: (x: number, z: number) => boolean,
  ): { ears: Ear[]; bumps: { x: number; z: number; severe: boolean; player: boolean }[] } {
    const ears: Ear[] = [];
    const bumps: { x: number; z: number; severe: boolean; player: boolean }[] = [];
    for (const car of this.cars) {
      const intent = driverIntent(car, [{ x: playerX, z: playerZ }, ...points], panicAt(car.x, car.z), yieldRoad);
      const accel = intent.target < car.speed ? 16 : 5;
      car.speed += Math.max(-accel * dt, Math.min(accel * dt, intent.target - car.speed));
      car.speed = Math.max(0, car.speed);
      car.mode = intent.mode;
      car.offset += (intent.offset - car.offset) * Math.min(1, dt * 2);
      const fixed = car.road + car.offset;
      const nextX = car.travel === 'x' ? car.x + car.dir * car.speed * dt : fixed;
      const nextZ = car.travel === 'z' ? car.z + car.dir * car.speed * dt : fixed;
      if (blocked(nextX, nextZ)) {
        car.dir = car.dir === 1 ? -1 : 1;
        car.speed *= 0.35;
      } else {
        car.x = Math.max(8, Math.min(WIDTH - 8, nextX));
        car.z = Math.max(8, Math.min(DEPTH - 8, nextZ));
      }
      car.yaw = yawOf(car);
      if (intent.horn && car.horn <= 0) {
        car.horn = 0.7;
        ears.push({ kind: 'horn', x: car.x, z: car.z, gain: 0.85, pitch: 0.9 + (car.color % 7) * 0.02 });
      }
      car.horn = Math.max(0, car.horn - dt);
      const playerGap = Math.hypot(car.x - playerX, car.z - playerZ);
      if (playerGap < 1.05 && car.speed > 8) {
        const severe = car.speed > 8;
        bumps.push({ x: car.x, z: car.z, severe, player: true });
        car.speed = 0;
        car.mode = 'stop';
        ears.push({ kind: 'impact', x: car.x, z: car.z, gain: severe ? 1 : 0.6, pitch: 0.8 });
      }
      const along = car.travel === 'x' ? car.x - playerX : car.z - playerZ;
      if (Math.abs(along) > 85) {
        if (car.travel === 'x') car.x = playerX - car.dir * 55;
        else car.z = playerZ - car.dir * 55;
        car.speed = 4;
      }
    }
    return { ears, bumps };
  }

  audible(x: number, z: number): { x: number; z: number; rate: number }[] {
    return this.cars
      .filter(car => car.speed > 0.4 && Math.hypot(car.x - x, car.z - z) < 70)
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))
      .slice(0, 2)
      .map(car => ({ x: car.x, z: car.z, rate: 0.7 + car.speed / 14 }));
  }
}
