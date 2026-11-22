// Positive modulo for tiled visual effects. JS remainder can be negative.
export function wrapRange(value: number, span: number): number {
  return ((value % span) + span) % span;
}
export function wrapNear(value: number, center: number, radius: number): number {
  return center + wrapRange(value - center + radius, radius * 2) - radius;
}

/** Visible rain density is bounded, and avoids work while skies are clear. */
export function visibleRainStreaks(capacity:number,rain:number,reducedMotion=false):number{
  if(reducedMotion||!Number.isFinite(capacity)||!Number.isFinite(rain)||capacity<=0||rain<=0.05)return 0;
  return Math.round(Math.floor(capacity)*Math.min(1,Math.max(0,rain)));
}
export function rainParticleBudget(quality:'high'|'standard'|'low'):number{
  return quality==='low'?480:quality==='standard'?1000:1600;
}
