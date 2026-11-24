export function cameraBlend(dt: number, rate: number): number {
  return 1 - Math.exp(-Math.max(0, dt) * Math.max(0, rate));
}

export function cityCameraShake(time: number, strength: number): { x: number; y: number } {
  const amplitude = Math.max(0, Math.min(2.8, strength * 0.32));
  return { x: Math.sin(time * 37) * amplitude, y: Math.sin(time * 29 + 0.7) * amplitude * 0.65 };
}

export function ringProgress(remaining: number, duration: number): number {
  const t = duration > 0 ? Math.max(0, Math.min(1, 1 - remaining / duration)) : 1;
  return 1 - (1 - t) * (1 - t);
}
