/** Collapses pointer-lock loss and the key or button that caused it into one pause. */
export function createPauseLatch(holdMs = 280) {
  let until = 0;
  return {
    arm(now: number): void { if (Number.isFinite(now)) until = now + holdMs; },
    blocks(now: number): boolean { return Number.isFinite(now) && now < until; },
  };
}
