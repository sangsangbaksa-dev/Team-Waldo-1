/**
 * True supercover ray traversal: unlike point sampling, a ray exactly along
 * a tile corner must have both adjacent cells open. World coordinates use
 * tile centers at integer multiples of tileSize.
 */
export function lineClear(map, tileSize, a, b) {
  if (!(tileSize > 0) || !Array.isArray(map) || !map.length ||
      ![a?.x, a?.z, b?.x, b?.z, tileSize].every(Number.isFinite)) return false;
  const width = map[0]?.length ?? 0;
  if (!width) return false;
  const ax = a.x / tileSize + 0.5;
  const az = a.z / tileSize + 0.5;
  const bx = b.x / tileSize + 0.5;
  const bz = b.z / tileSize + 0.5;
  let x = Math.floor(ax), z = Math.floor(az);
  const endX = Math.floor(bx), endZ = Math.floor(bz);
  const dx = bx - ax, dz = bz - az;
  const sx = Math.sign(dx), sz = Math.sign(dz);
  const tx = sx ? 1 / Math.abs(dx) : Infinity;
  const tz = sz ? 1 / Math.abs(dz) : Infinity;
  let mx = sx ? (sx > 0 ? x + 1 - ax : ax - x) * tx : Infinity;
  let mz = sz ? (sz > 0 ? z + 1 - az : az - z) * tz : Infinity;
  const open = (col, row) => map[row]?.[col] === ".";
  if (!open(x, z) || !open(endX, endZ)) return false;
  while (x !== endX || z !== endZ) {
    const nextX = x === endX ? Infinity : mx;
    const nextZ = z === endZ ? Infinity : mz;
    if (Math.abs(nextX - nextZ) < 1e-10) {
      // Both edge-adjacent tiles must be free at a diagonal crossing.
      if (!open(x + sx, z) || !open(x, z + sz)) return false;
      x += sx;
      z += sz;
      mx += tx;
      mz += tz;
    } else if (nextX < nextZ) {
      x += sx;
      mx += tx;
    } else {
      z += sz;
      mz += tz;
    }
    if (!open(x, z)) return false;
  }
  return true;
}

/**
 * Acoustic distance through corridors instead of Euclidean distance through
 * thick walls. A half-tile allowance avoids sudden silence near cell edges.
 */
export function soundTravelDistance(visible, directDistance, corridorSteps, tileSize) {
  if (visible) return Number.isFinite(directDistance) && directDistance >= 0 ? directDistance : Infinity;
  if (!Number.isInteger(corridorSteps) || corridorSteps < 0 ||
      !Number.isFinite(tileSize) || tileSize <= 0) return Infinity;
  return Math.max(0, corridorSteps - 0.5) * tileSize;
}
