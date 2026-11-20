/** Bound physical render resolution without changing CSS layout or simulation timing. */
export function renderPixelRatio(width: number, height: number, deviceRatio: number, quality: string): number {
  const cap = quality === 'high' ? 2 : quality === 'standard' ? 1.5 : 1;
  const budget = quality === 'high' ? 4_200_000 : quality === 'standard' ? 2_600_000 : 1_500_000;
  const dimension = (v: number): number => Number.isFinite(v) && v > 0 ? v : 1;
  const area = Math.max(1, dimension(width)) * Math.max(1, dimension(height));
  const ratio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  // Oversize canvases must still obey the pixel budget, even below half resolution.
  return Math.min(ratio, cap, Math.sqrt(budget / area));
}
