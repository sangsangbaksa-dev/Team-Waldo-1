export interface VehicleSpec {
  name: string;
  max: number;
  accel: number;
  brake: number;
  steer: number;
  grip: number;
  mass: number;
  length: number;
  width: number;
  color: number;
}

export interface VehicleBody {
  id: number;
  type: string;
  spec: VehicleSpec;
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  health: number;
  driver: boolean;
  steer: number;
  impact: number;
  traffic: unknown;
  door?: number;
}

export interface VehicleInput {
  throttle: number;
  steer: number;
  handbrake: boolean;
}

export const LIMIT: number;

export function clamp(n: number, lo: number, hi: number): number;
export function forward(yaw: number): { x: number; z: number };
export function angleDelta(target: number, current: number): number;
export function longitudinal(vehicle: VehicleBody): number;
export function makeVehicle(id: number, type: string, x: number, z: number, yaw: number, driver?: boolean): VehicleBody;
export function stepVehicle(vehicle: VehicleBody, input: VehicleInput, dt: number, offroad?: boolean): void;
export function hitWall(vehicle: VehicleBody, box: { x: number; z: number; w: number; d: number }): void;
export function collide(a: VehicleBody, b: VehicleBody): boolean;
