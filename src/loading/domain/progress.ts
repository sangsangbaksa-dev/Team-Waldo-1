/** 로딩 진행률. 화면과 네트워크를 모르고, 한 번 올라간 값은 내려가지 않습니다. */
export type LoadPhase = 'loading' | 'ready';

export interface LoadSnapshot {
  phase: LoadPhase;
  /** 0~1. 직전 값보다 작아지지 않습니다. */
  fraction: number;
  percent: number;
  label: string;
  note: string;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export class LoadProgress {
  private fraction = 0;
  private label: string;
  private note = '';
  private phase: LoadPhase = 'loading';

  constructor(label = '불러오는 중') { this.label = label; }

  snapshot(): LoadSnapshot {
    return { phase: this.phase, fraction: this.fraction, percent: Math.floor(this.fraction * 100), label: this.label, note: this.note };
  }

  /** 측정된 진행률. 더 작은 값·숫자가 아닌 값은 막대를 움직이지 않습니다. */
  report(fraction: number, label?: string): LoadSnapshot {
    if (this.phase === 'ready') return this.snapshot();
    if (label) this.label = label;
    if (Number.isFinite(fraction)) {
      const next = clamp01(fraction);
      if (next > this.fraction) this.fraction = next;
    }
    return this.snapshot();
  }

  /**
   * 소식이 없는 동안 아주 조금 앞으로. cap 이 현재보다 낮아도 되돌리지 않고, 1에는 닿지 않습니다.
   * 완료는 complete() 만 합니다.
   */
  creep(amount: number, cap = 0.35): LoadSnapshot {
    if (this.phase === 'ready') return this.snapshot();
    const ceiling = Math.min(0.99, Math.max(0, cap));
    const step = Math.max(0, amount);
    const next = Math.min(ceiling, this.fraction + step);
    if (next > this.fraction) this.fraction = next;
    return this.snapshot();
  }

  labelText(label: string): LoadSnapshot {
    if (this.phase !== 'ready' && label) this.label = label;
    return this.snapshot();
  }

  noteText(note: string): LoadSnapshot {
    if (this.phase !== 'ready') this.note = note;
    return this.snapshot();
  }

  complete(label?: string): LoadSnapshot {
    this.phase = 'ready';
    this.fraction = 1;
    this.note = '';
    if (label) this.label = label;
    return this.snapshot();
  }
}

/** 자식 로더의 0~1 을 구간 안으로 접습니다. */
export function bandFraction(fraction: number, start: number, end: number): number {
  const span = end - start;
  const t = Number.isFinite(fraction) ? clamp01(fraction) : 0;
  return start + span * t;
}
