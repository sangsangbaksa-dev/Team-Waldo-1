/** Move opacity toward a target and report whether its GPU-visible byte changed.
 * Keep the continuous value for smooth interpolation; skip texture uploads
 * when every rounded alpha byte is unchanged.
 */
export function updateFogAlpha(current: Float32Array, rgba: Uint8Array, index: number, alphaIndex: number, target: number, factor: number): boolean {
  const value = current[index] + (target - current[index]) * factor;
  current[index] = value;
  const alpha = Math.round(value);
  if (rgba[alphaIndex] === alpha) return false;
  rgba[alphaIndex] = alpha;
  return true;
}
