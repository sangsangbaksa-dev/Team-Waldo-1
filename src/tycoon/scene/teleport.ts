import { WORLD_HALF } from './layout';

interface LandingPoint {
  x: number;
  z: number;
}

const LANDING_LIMIT = WORLD_HALF - 2;
const SEARCH_RADII = [2, 4, 7, 10, 14];

/** Try the marked point first, then search outward for a nearby landing. */
export function findTeleportLanding(
  pin: LandingPoint,
  isClear: (point: LandingPoint) => boolean,
): LandingPoint | null {
  const inBounds = ({ x, z }: LandingPoint): boolean =>
    Number.isFinite(x) && Number.isFinite(z) && Math.abs(x) <= LANDING_LIMIT && Math.abs(z) <= LANDING_LIMIT;

  if (!inBounds(pin)) return null;
  if (isClear(pin)) return pin;

  for (const radius of SEARCH_RADII) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const point = { x: pin.x + radius * Math.cos(angle), z: pin.z + radius * Math.sin(angle) };
      if (inBounds(point) && isClear(point)) return point;
    }
  }
  return null;
}
