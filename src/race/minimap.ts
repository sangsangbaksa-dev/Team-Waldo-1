/** Center tracks on both axes while preserving their aspect ratio. */
export function minimapTransform(xs: ArrayLike<number>, zs: ArrayLike<number>, size = 220, margin = 15): { minX: number; minZ: number; scale: number; x: number; z: number } {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < Math.min(xs.length, zs.length); i++) {
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]); minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]);
  }
  if (!Number.isFinite(minX + minZ + maxX + maxZ)) return { minX: 0, minZ: 0, scale: 1, x: size / 2, z: size / 2 };
  const w = maxX - minX, h = maxZ - minZ, scale = Math.max(1, size - 2 * margin) / Math.max(w, h, 1);
  return { minX, minZ, scale, x: (size - w * scale) / 2, z: (size - h * scale) / 2 };
}
