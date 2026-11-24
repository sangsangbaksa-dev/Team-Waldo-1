/**
 * 게임 불러오기. 진행률 계산(domain)·세션(application)·수신(infrastructure)·게이지(ui)를 나눕니다.
 * 느리거나 끊겨도 실패 화면으로 바꾸지 않고, 게이지는 뒤로 가지 않습니다.
 */
export { LoadProgress, bandFraction, type LoadPhase, type LoadSnapshot } from './loading/domain/progress';
export { decideRetry, type LoadDecision, type RetryContext } from './loading/domain/policy';
export { createLoadSession, type LoadSession } from './loading/application/session';
export { backoffMs, retry, retryNote, type RetryOptions } from './loading/infrastructure/retry';
export { importFresh, retryModuleUrl } from './loading/infrastructure/module-url';
export { fetchBuffer } from './loading/infrastructure/fetch-buffer';
export { showLoading, type LoadingScreen } from './loading/ui/screen';
