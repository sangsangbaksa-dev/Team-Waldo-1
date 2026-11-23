export const SCATTER_CELL = 64;
export const STRUCTURE_CELL = 128;

export function spatialCell(position: number, size: number): number {
  return Math.floor(position / size);
}

export function cellIsNear(x: number, z: number, cellX: number, cellZ: number, radius: number): boolean {
  const left = cellX * SCATTER_CELL, top = cellZ * SCATTER_CELL;
  const dx = Math.max(left - x, 0, x - (left + SCATTER_CELL));
  const dz = Math.max(top - z, 0, z - (top + SCATTER_CELL));
  return dx * dx + dz * dz <= radius * radius;
}
