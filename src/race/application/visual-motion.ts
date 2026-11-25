/** Presentation-only timing. No simulation or renderer dependencies. */
export function motionWeight(dt: number, rate: number): number {
  return 1 - Math.exp(-Math.max(0, dt) * Math.max(0, rate));
}

export function emissionCount(rate: number, dt: number, sample = Math.random()): number {
  const expected = Math.max(0, rate) * Math.min(0.1, Math.max(0, dt));
  const whole = Math.floor(expected);
  return whole + Number(sample < expected - whole);
}

export function presentationFov(target: number, reduced: boolean): number {
  return reduced ? Math.min(72, 60 + (target - 60) * 0.35) : Math.min(90, target);
}
