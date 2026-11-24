export interface TensionView {
  danger: number;
  pulseSeconds: number;
  hot: boolean;
  heartbeat: boolean;
  beatInterval: number;
}

/** Maps suspicion 0..100 onto the vignette, the heartbeat, and the hot chip. */
export function tensionView(sus: number): TensionView {
  const s = Math.max(0, Math.min(100, sus));
  const tension = Math.max(0, Math.min(1, (s - 45) / 55));
  const beatInterval = 1.15 - tension * 0.65;
  return {
    danger: Math.max(0, (s - 25) / 75),
    pulseSeconds: s > 45 ? beatInterval : 1.4,
    hot: s > 70,
    heartbeat: s > 45,
    beatInterval,
  };
}
