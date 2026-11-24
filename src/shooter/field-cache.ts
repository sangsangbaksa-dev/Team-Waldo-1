import { makeRng } from './config';
import { blockedAt, type GameMap } from './world';
import { waterDepth } from './terrain';

export const CACHE_RADIUS = 4;
export const CACHE_SECONDS = 7;
export const CACHE_CONTEST_RADIUS = 18;
export interface FieldCache {
  x: number; z: number; progress: number; claimed: boolean; expired: boolean; contested: boolean;
}

export function createFieldCaches(map: GameMap, seed: number): FieldCache[] {
  const rng = makeRng(seed ^ 0x4d2a9c71);
  const sites: FieldCache[] = [];
  for (let attempt = 0; attempt < 160 && sites.length < 2; attempt++) {
    const a = rng() * Math.PI * 2, r = map.half * (0.18 + rng() * 0.34);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blockedAt(map, x, z, 4) || waterDepth(map.terrain, x, z) || sites.some(c => Math.hypot(c.x - x, c.z - z) < 90)) continue;
    sites.push({ x, z, progress: 0, claimed: false, expired: false, contested: false });
  }
  return sites;
}

export function advanceCache(cache: FieldCache, dt: number, present: boolean, contested: boolean, safe: boolean): boolean {
  if (cache.claimed || cache.expired) return false;
  if (!safe) { cache.expired = true; cache.progress = 0; return false; }
  cache.contested = contested;
  cache.progress = Math.max(0, Math.min(CACHE_SECONDS, cache.progress + dt * (present && !contested ? 1 : -2)));
  if (cache.progress < CACHE_SECONDS - 1e-6) return false;
  cache.claimed = true;
  return true;
}
