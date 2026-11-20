/** Bound physical render resolution without changing CSS layout or simulation timing. */
export function renderPixelRatio(width: number, height: number, deviceRatio: number, quality: string): number {
  const cap = quality === 'high' ? 2 : quality === 'standard' ? 1.5 : 1;
  const budget = quality === 'high' ? 4_200_000 : quality === 'standard' ? 2_600_000 : 1_500_000;
  const area = Math.max(1, width || 1) * Math.max(1, height || 1);
  const ratio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  return Math.max(0.5, Math.min(ratio, cap, Math.sqrt(budget / area)));
}
