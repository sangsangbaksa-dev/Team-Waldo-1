import { LoadProgress, type LoadSnapshot } from '../domain/progress';

/**
 * 한 번의 게임 불러오기. 측정값은 올라가기만 하고, 기다리는 동안에는 완료 직전까지 살짝만 움직입니다.
 * 시간 초과로 실패 단계에 들어가지 않습니다.
 */
export interface LoadSession {
  snapshot(): LoadSnapshot;
  report(fraction: number, label?: string, now?: number): LoadSnapshot;
  hold(label?: string): LoadSnapshot;
  note(text: string): LoadSnapshot;
  tick(now: number): LoadSnapshot;
  complete(label?: string): LoadSnapshot;
}

export function createLoadSession(label = '불러오는 중'): LoadSession {
  const progress = new LoadProgress(label);
  /** 실제로 보고된 최고 진행률. 0 이면 아직 측정 전이라 대기 상한까지만 움직입니다. */
  let measured = 0;
  let lastReal = 0;
  return {
    snapshot: () => progress.snapshot(),
    report(fraction, text, now = Date.now()) {
      lastReal = now;
      const snap = progress.report(fraction, text);
      measured = Math.max(measured, snap.fraction);
      return snap;
    },
    hold(text) { return text ? progress.labelText(text) : progress.snapshot(); },
    note(text) { return progress.noteText(text); },
    tick(now) {
      const snap = progress.snapshot();
      if (snap.phase !== 'loading') return snap;
      if (lastReal !== 0 && now - lastReal < 700) return snap;
      const cap = measured <= 0 ? 0.35 : Math.min(0.97, measured + 0.02);
      return progress.creep(0.008, cap);
    },
    complete(text) { return progress.complete(text); },
  };
}
