// Convert a click from a displayed minimap into bounded world coordinates.
// Use each rendered axis independently: mobile layout may change the aspect ratio.
import { SIZE } from './defs';

export function mapPointerToWorld(
  clientX: number, clientY: number, left: number, top: number, width: number, height: number,
): { x: number; y: number } | null {
  if (![clientX, clientY, left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const clamp = (v: number): number => Math.max(0, Math.min(SIZE, v));
  return { x: clamp((clientX - left) / width * SIZE), y: clamp((clientY - top) / height * SIZE) };
}
