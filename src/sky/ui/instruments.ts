export interface RadarBox { x: number; y: number; r: number }

/** Bottom-right on a mouse, lifted above the weapon stack on a touch screen. */
export function radarBox(width: number, height: number, coarse: boolean): RadarBox {
  const r = Math.max(42, Math.min(58, Math.min(width, height) * 0.09));
  const margin = 16;
  if (coarse) return { x: Math.max(r + margin, width - r - margin), y: Math.max(r + 96, height - r - 228), r };
  return { x: width - r - margin, y: height - r - margin, r };
}

export function flightLine(speed: number, g: number, minSpeed: number): { text: string; stalling: boolean } {
  return {
    text: `${Math.round(speed * 3.6)} km/h · ${g.toFixed(1)} G`,
    stalling: speed < minSpeed * 0.9,
  };
}
