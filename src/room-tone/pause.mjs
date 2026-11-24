export function createPauseLatch(holdMs = 320) {
  let until = 0;
  return {
    arm(now) { if (Number.isFinite(now)) until = now + holdMs; },
    blocks(now) { return Number.isFinite(now) && now < until; },
  };
}
