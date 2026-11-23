/** Restores a degraded visual tier after sustained stable frames, without FPS oscillation. */
export function advanceSkyQualityRecovery(
  stableSeconds: number, frameMs: number, dt: number, degradedLevel: number,
): { stableSeconds: number; restore: boolean } {
  if (degradedLevel <= 0) return { stableSeconds: 0, restore: false };
  const seconds = Math.min(Math.max(0, dt), 0.05);
  const next = frameMs > 0 && frameMs < 19
    ? stableSeconds + seconds
    : Math.max(0, stableSeconds - seconds * 4);
  return next >= 15 ? { stableSeconds: 0, restore: true } : { stableSeconds: next, restore: false };
}
