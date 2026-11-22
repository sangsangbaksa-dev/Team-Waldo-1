// FRONTLINE — fog alpha interpolation, independent from WebGL for testability.
import { FOG_HIDDEN, FOG_SEEN } from './vision';

export interface FogBlendResult { dirty: boolean; settled: boolean }

/**
 * Update the CPU-side alpha channel. Return whether a GPU upload is needed.
 * Fog pixels are flipped vertically because the simulation and texture rows
 * use opposite coordinate conventions.
 */
export function blendFogAlpha(
  data: Uint8Array,
  current: Float32Array,
  states: Uint8Array,
  n: number,
  factor: number,
  hidden: number,
  seen: number,
): FogBlendResult {
  let dirty = false, settled = true;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, state = states[i];
    const target = state === FOG_HIDDEN ? hidden : state === FOG_SEEN ? seen : 0;
    const before = current[i];
    const value = Math.abs(before - target) < 0.5 ? target : before + (target - before) * factor;
    current[i] = value;
    const at = ((n - 1 - y) * n + x) * 4 + 3, alpha = Math.round(value);
    if (data[at] !== alpha) { data[at] = alpha; dirty = true; }
    if (Math.abs(target - value) >= 0.5) settled = false;
  }
  return { dirty, settled };
}
