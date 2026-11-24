/** 한 번 실패한 불러오기를 이어갈지. 시간 초과는 실패 화면으로 보내지 않습니다. */
export type LoadDecision = 'continue' | 'stop';

export interface RetryContext {
  /** 지금까지 실패한 횟수(1부터). */
  attempt: number;
  cancelled: boolean;
  /** 파일이 없다는 식으로, 다시 받아도 달라지지 않는 오류. 연결 지연은 여기 넣지 않습니다. */
  definitive: boolean;
  maxAttempts?: number;
}

export function decideRetry(ctx: RetryContext): LoadDecision {
  if (ctx.cancelled || ctx.definitive) return 'stop';
  if (ctx.maxAttempts !== undefined && ctx.attempt >= ctx.maxAttempts) return 'stop';
  return 'continue';
}
