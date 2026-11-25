export const IMPACT_LIFETIME = 0.3;
export const IMPACT_LIMIT = 48;

export function blendMotion(dt: number, rate: number): number {
  return 1 - Math.exp(-Math.max(0, dt) * Math.max(0, rate));
}

export function impactFrame(age: number, hit: boolean, own: boolean): { scale: number; opacity: number } {
  const t = Math.max(0, Math.min(1, age / IMPACT_LIFETIME));
  const expansion = 1 - (1 - t) ** 3;
  return {
    scale: (hit ? 0.8 : 0.65) * (own ? 1.15 : 1) + expansion * (hit ? 0.6 : 1.35),
    opacity: (hit ? 0.66 : 0.48) * (1 - t) ** 2,
  };
}
