import { WORLD_HALF } from './layout';

interface MapPoint { x: number; z: number }
interface VehiclePosition extends MapPoint { name: string; heading: number }

export interface SessionPosition extends MapPoint {
  yaw: number;
  waypoint: MapPoint | null;
  ride: VehiclePosition | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mapPoint(value: Record<string, unknown> | null): MapPoint | null {
  const x = value?.x, z = value?.z;
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  return Math.abs(x) <= WORLD_HALF - 2 && Math.abs(z) <= WORLD_HALF - 2 ? { x, z } : null;
}

/** Older saves have no world field and keep the regular spawn behavior. */
export function readSessionPosition(save: unknown): SessionPosition | null {
  const world = record(record(save)?.world);
  const position = mapPoint(world), yaw = world?.yaw;
  if (!position || typeof yaw !== 'number' || !Number.isFinite(yaw)) return null;

  const vehicle = record(world?.ride);
  const car = mapPoint(vehicle), name = vehicle?.name, heading = vehicle?.heading;
  const ride = car && typeof name === 'string' && typeof heading === 'number' && Number.isFinite(heading)
    ? { ...car, name, heading } : null;
  return { ...position, yaw, waypoint: mapPoint(record(world?.waypoint)), ride };
}
