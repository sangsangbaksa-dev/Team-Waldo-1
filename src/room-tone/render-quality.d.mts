export type VisualQuality = "low" | "standard" | "high";
export function renderingScale(
  width: number, height: number, deviceRatio: number,
  touch?: boolean, quality?: VisualQuality,
): number;
export function selectQuality(
  preferences: unknown, smallViewport: boolean
): VisualQuality;
