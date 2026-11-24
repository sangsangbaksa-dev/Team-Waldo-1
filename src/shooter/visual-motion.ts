export function motionBlend(dt: number, rate: number): number {
  return 1 - Math.exp(-Math.max(0, dt) * Math.max(0, rate));
}

export function proxyVisible(wasFar: boolean, distance: number, allowed: boolean): boolean {
  return allowed && distance > (wasFar ? 68 : 82);
}

export function wrappedOffset(value: number, half: number): number {
  const width = half * 2;
  return ((value + half) % width + width) % width - half;
}

export function cameraVibration(time: number, strength: number, reduced: boolean) {
  const a = reduced ? 0 : Math.max(0, Math.min(1, strength)) * 0.0035;
  if (a === 0) return { pitch: 0, yaw: 0, roll: 0 };
  return { pitch: Math.sin(time * 37) * a, yaw: Math.sin(time * 29 + 0.6) * a, roll: Math.sin(time * 23) * a * 0.5 };
}
