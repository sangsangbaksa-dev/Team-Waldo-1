/** Cap physical render pixels while respecting device DPR and screen size. */
export function renderingScale(width, height, deviceRatio, touch = false) {
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const dpr = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  // The horror scene's fog, flashlight and transparent overlays are fill-rate
  // sensitive. Keep desktop clarity while protecting mobile/4K GPUs.
  const dprCap = touch ? 1.35 : 1.65;
  const pixelBudget = touch ? 1_350_000 : 3_000_000;
  return Math.max(0.3, Math.min(dpr, dprCap, Math.sqrt(pixelBudget / (w * h))));
}
