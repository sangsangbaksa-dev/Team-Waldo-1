// Third-person camera obstruction handling. Only the presentation camera is adjusted.
import { rayWorld, type GameMap } from './world';

export interface CameraPoint { x: number; y: number; z: number }

/** Shorten the desired camera arm at the first solid world obstacle.
 * The two neighboring rays keep the near plane out of wall edges, too. */
export function resolveChaseCamera(map: GameMap, anchor: CameraPoint, desired: CameraPoint, clearance = 0.28): CameraPoint {
  const dx = desired.x - anchor.x, dy = desired.y - anchor.y, dz = desired.z - anchor.z;
  const len = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(len) || len < 1e-6) return { ...anchor };
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const flat = Math.hypot(ux, uz);
  const ox = flat > 1e-6 ? uz / flat * clearance * 0.65 : 0;
  const oz = flat > 1e-6 ? -ux / flat * clearance * 0.65 : 0;
  let hit = rayWorld(map, anchor.x, anchor.y, anchor.z, ux, uy, uz, len);
  if (flat > 1e-6) {
    hit = Math.min(hit, rayWorld(map, anchor.x + ox, anchor.y, anchor.z + oz, ux, uy, uz, len), rayWorld(map, anchor.x - ox, anchor.y, anchor.z - oz, ux, uy, uz, len));
  }
  if (!Number.isFinite(hit)) return { ...desired };
  const distance = Math.max(0, Math.min(len, hit - Math.max(0, clearance)));
  return { x: anchor.x + ux * distance, y: anchor.y + uy * distance, z: anchor.z + uz * distance };
}
