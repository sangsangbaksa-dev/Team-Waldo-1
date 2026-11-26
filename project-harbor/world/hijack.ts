import { worldRight } from './roads';

export const HIJACK_WANTED = 1.35;
export const HIJACK_RANGE = 3.5;
export const HIJACK_SPEED = 7;
export const DOOR_TIME = 0.35;
export const PULL_TIME = 0.7;
export const BOARD_TIME = 0.25;

export type CarControl = 'ai' | 'reserved' | 'player' | 'pursuit';

export interface HijackCar {
  id: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  width: number;
  control: CarControl;
  occupied: boolean;
}

export interface Hijack {
  carId: number;
  phase: 'door' | 'pull' | 'board';
  time: number;
  occupied: boolean;
  exitX: number;
  exitZ: number;
  seatX: number;
  seatZ: number;
  driverX: number;
  driverZ: number;
  crimeId: string;
}

export interface HijackEvent {
  type: 'driver' | 'board' | 'crime';
  id: string;
  amount: number;
  x: number;
  z: number;
  yaw: number;
}

export type HijackRefusal = 'ready' | 'far' | 'fast' | 'owned' | 'blocked';

export interface DoorPoint {
  x: number;
  z: number;
  seatX: number;
  seatZ: number;
}

export function doorPoint(car: Pick<HijackCar, 'x' | 'z' | 'yaw' | 'width'>, side = 1): DoorPoint {
  const right = worldRight(car.yaw);
  const reach = car.width * 0.5 + 0.9;
  return {
    x: car.x + right.x * reach * side,
    z: car.z + right.z * reach * side,
    seatX: car.x + right.x * 0.38 * side,
    seatZ: car.z + right.z * 0.38 * side,
  };
}

export function doorOpen(hijack: Hijack | null): number {
  if (!hijack) return 0;
  if (hijack.phase === 'door') return Math.min(1, hijack.time / DOOR_TIME);
  return 1;
}

export function beginHijack(
  car: HijackCar,
  playerX: number,
  playerZ: number,
  attempt: number,
  clear: (x: number, z: number) => boolean,
): { hijack: Hijack | null; reason: HijackRefusal } {
  if (car.control !== 'ai') return { hijack: null, reason: 'owned' };
  if (Math.abs(car.speed) > HIJACK_SPEED) return { hijack: null, reason: 'fast' };
  if (Math.hypot(car.x - playerX, car.z - playerZ) > HIJACK_RANGE) return { hijack: null, reason: 'far' };
  const door = doorPoint(car);
  const alternate = doorPoint(car, -1);
  const exit = clear(door.x, door.z) ? door : clear(alternate.x, alternate.z) ? alternate : null;
  if (!exit) return { hijack: null, reason: 'blocked' };
  return {
    reason: 'ready',
    hijack: {
      carId: car.id,
      phase: 'door',
      time: 0,
      occupied: car.occupied,
      exitX: exit.x,
      exitZ: exit.z,
      seatX: exit.seatX,
      seatZ: exit.seatZ,
      driverX: exit.seatX,
      driverZ: exit.seatZ,
      crimeId: 'hijack:' + car.id + ':' + attempt,
    },
  };
}

export function stepHijack(hijack: Hijack, dt: number): { hijack: Hijack | null; events: HijackEvent[] } {
  const next: Hijack = { ...hijack, time: hijack.time + dt };
  const events: HijackEvent[] = [];
  if (next.phase === 'door' && next.time >= DOOR_TIME) {
    next.phase = next.occupied ? 'pull' : 'board';
    next.time = 0;
  }
  if (next.phase === 'pull') {
    const t = Math.min(1, next.time / PULL_TIME);
    next.driverX = next.seatX + (next.exitX - next.seatX) * t;
    next.driverZ = next.seatZ + (next.exitZ - next.seatZ) * t;
    if (next.time >= PULL_TIME) {
      events.push({
        type: 'driver', id: 'driver:' + next.crimeId, amount: 0,
        x: next.exitX, z: next.exitZ, yaw: Math.atan2(next.exitX - next.seatX, -(next.exitZ - next.seatZ)),
      });
      next.phase = 'board';
      next.time = 0;
    }
  }
  if (next.phase === 'board' && next.time >= BOARD_TIME) {
    if (next.occupied) {
      events.push({
        type: 'crime', id: next.crimeId, amount: HIJACK_WANTED,
        x: next.exitX, z: next.exitZ, yaw: 0,
      });
    }
    events.push({
      type: 'board', id: 'board:' + next.crimeId, amount: 0,
      x: next.exitX, z: next.exitZ, yaw: 0,
    });
    return { hijack: null, events };
  }
  return { hijack: next, events };
}
