/** Cap physical render pixels while respecting shared arcade visual settings. */
const QUALITY = {
  low: { dpr: 1, pixels: 650_000 },
  standard: { dpr: 1.4, pixels: 1_500_000 },
  high: { dpr: 1.65, pixels: 3_000_000 },
};
export function renderingScale(width, height, deviceRatio, touch = false, quality = "high") {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const dpr = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const preset = quality === "low" ? QUALITY.low
    : quality === "standard" ? QUALITY.standard : QUALITY.high;
  const maxDpr = touch ? Math.min(1.35, preset.dpr) : preset.dpr;
  const pixelBudget = touch ? Math.min(1_350_000, preset.pixels) : preset.pixels;
  return Math.max(0.1, Math.min(dpr, maxDpr, Math.sqrt(pixelBudget / (w * h))));
}
