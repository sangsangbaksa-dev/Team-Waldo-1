// Presentation-only motion curves. No renderer or simulation state is mutated here.
export function dampingAlpha(rate: number, dt: number): number {
  return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}

export function emissionChance(rate: number, dt: number): number {
  return dampingAlpha(rate, dt);
}

export function flightCameraFov(cockpit: boolean, speed: number, boost: number, reducedMotion: boolean): number {
  const thrust = Math.max(0, Math.min(1, boost));
  if (reducedMotion) return cockpit ? 70 : 62;
  return cockpit ? 70 + thrust * 3 : Math.max(58, Math.min(76, 62 + thrust * 10 + (speed - 140) * 0.04));
}

export function impactOffset(time: number, strength: number, reducedMotion: boolean): { x: number; y: number } {
  const a = reducedMotion ? 0 : Math.max(0, Math.min(1, strength));
  return { x: Math.sin(time * 28) * a, y: Math.sin(time * 37 + 0.7) * a * 0.6 };
}
