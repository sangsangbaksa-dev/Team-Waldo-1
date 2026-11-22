/** Choose render resolution from arcade settings without overspending GPU memory. */
const SETTINGS = {
  low: {dpr:1.0,pixels:650000},
  standard: {dpr:1.4,pixels:1250000},
  high: {dpr:1.7,pixels:2200000},
};
export function renderingScale(width,height,deviceRatio,quality,touch=false) {
  const preset=SETTINGS[quality] ?? SETTINGS[touch?"standard":"high"];
  const w=Number.isFinite(width) && width>0 ? width : 1;
  const h=Number.isFinite(height) && height>0 ? height : 1;
  const ratio=Number.isFinite(deviceRatio) && deviceRatio>0 ? deviceRatio : 1;
  const budgetRatio=Math.sqrt(preset.pixels/(w*h));
  return Math.max(0.1,Math.round(Math.min(ratio,preset.dpr,budgetRatio)*100)/100);
}
