import { decideRetry } from '../domain/policy';

const sleep = (ms: number): Promise<void> => new Promise(r => window.setTimeout(r, ms));

export function backoffMs(attempt: number): number { return Math.min(8000, 600 * 2 ** Math.min(attempt, 5)); }

export interface RetryOptions {
  /** 이 횟수에 도달하면 마지막 오류를 던집니다. 생략하면 멈춤 조건이 오기 전까지 계속합니다. */
  maxAttempts?: number;
  /** 실패 후 다음 시도를 기다리기 직전에 호출됩니다(attempt 는 지금까지 실패한 횟수). */
  onRetry?: (attempt: number, error: unknown) => void;
  /** 재시도를 멈춰야 하면 true (예: 사용자가 다른 화면으로 나감). 멈추면 마지막 오류를 던집니다. */
  cancelled?: () => boolean;
  /**
   * false 면 그 오류는 다시 시도하지 않습니다.
   * 연결이 끊기거나 시간이 지난 경우는 true 로 두어 진행 중인 로딩을 유지합니다.
   */
  retryable?: (error: unknown) => boolean;
}

export async function retry<T>(task: (attempt: number) => Promise<T>, opt: RetryOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await task(attempt); }
    catch (e) {
      const decision = decideRetry({
        attempt: attempt + 1,
        cancelled: opt.cancelled?.() ?? false,
        definitive: opt.retryable ? !opt.retryable(e) : false,
        maxAttempts: opt.maxAttempts,
      });
      if (decision === 'stop') throw e;
      opt.onRetry?.(attempt + 1, e);
      await sleep(backoffMs(attempt));
    }
  }
}

/** 재시도 안내. 실패 화면으로 바꾸지 않고, 같은 로딩을 이어 간다는 것만 조용히 알립니다. */
export function retryNote(attempt: number): string {
  return attempt < 2 ? '' : '응답을 기다리는 중';
}
