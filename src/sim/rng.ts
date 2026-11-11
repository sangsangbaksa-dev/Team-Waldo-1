/** 시드 RNG (mulberry32). sim 안에서는 Math.random 대신 이것만 쓴다. */
export interface Rng {
  s: number;
}

export function createRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** [0, 1) */
export function next(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** [0, n) 정수 */
export function nextInt(rng: Rng, n: number): number {
  return Math.floor(next(rng) * n);
}

export function range(rng: Rng, min: number, max: number): number {
  return min + next(rng) * (max - min);
}
