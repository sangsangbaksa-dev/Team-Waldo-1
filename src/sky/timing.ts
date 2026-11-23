/** Bound physics steps on slow rendering devices without slowing the clock
 * on ordinary 30–60 fps frames. Large tab-resume gaps are intentionally capped
 * to avoid teleporting a jet through terrain while its input is unknown. */
export interface SkyFramePlan {
  elapsed: number;
  steps: number;
  stepDt: number;
}

export function planSkyFrame(frameMs: number): SkyFramePlan {
  if (!Number.isFinite(frameMs) || frameMs <= 0) return { elapsed: 0, steps: 0, stepDt: 0 };
  const elapsed = Math.min(0.2, frameMs / 1000);
  const steps = Math.ceil(elapsed / 0.05);
  return { elapsed, steps, stepDt: elapsed / steps };
}
