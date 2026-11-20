/** Run bounded simulation work without blocking the next browser frame. */
export interface FastForwardTarget {
  readonly over: boolean;
  step(seconds: number): void;
  drain(): unknown;
}

export function advanceFastForward(target: FastForwardTarget, remaining: number, now: () => number, budgetMs = 7, maxSteps = 120): number {
  const deadline = now() + budgetMs;
  let count = 0;
  while (remaining > 0 && !target.over && count < maxSteps && (count === 0 || now() < deadline)) {
    target.step(1 / 30);
    target.drain();
    remaining--;
    count++;
  }
  return remaining;
}
