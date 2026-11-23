/** 관전 결과 계산을 프레임으로 나눠 메인 스레드를 오래 점유하지 않습니다. */
export const FAST_FORWARD = { stepSeconds: 1 / 30, maxStepsPerFrame: 90, budgetMs: 7 } as const;

export interface FastForwardable {
  over: boolean;
  step(dt: number): void;
  drain(): unknown;
}

export function advanceMatchChunk(
  match: FastForwardable,
  remainingSteps: number,
  clock: () => number = () => performance.now(),
): number {
  if (match.over || !Number.isFinite(remainingSteps) || remainingSteps <= 0) return 0;
  const deadline = clock() + FAST_FORWARD.budgetMs;
  const maxSteps = Math.min(FAST_FORWARD.maxStepsPerFrame, Math.floor(remainingSteps));
  let processed = 0;
  while (processed < maxSteps && !match.over) {
    match.step(FAST_FORWARD.stepSeconds);
    match.drain();
    processed++;
    if (clock() >= deadline) break;
  }
  return processed;
}
