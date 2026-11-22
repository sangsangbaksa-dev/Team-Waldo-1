// 적응형 화질(추가 전용 공용 모듈): 프레임이 길어지면 해상도 → (레벨 1~3) 후처리·그림자·장식 순으로 단계적으로 낮춥니다.
// city/render3d.ts 의 adaptResolution + govern 과 같은 규칙을 게임 밖에서 재사용할 수 있게 뽑았습니다.
export interface AdaptiveOptions {
  /** 화질 설정이 허용하는 최대 픽셀 배율(devicePixelRatio 로 이미 잘라 둔 값) */
  max: number;
  /** 처음 시작할 배율(기본 min(max, 1.5)): 고해상도 화면에서 첫 몇 초가 끊기지 않게 */
  start?: number;
  /** 해상도 변경 시 호출: renderer.setPixelRatio + setSize + 후처리 setSize */
  setPixelRatio(pr: number): void;
  /** 해상도가 바닥인데도 느릴 때 호출(1→3). 이미 낮춘 단계는 되돌리지 않습니다. */
  setLevel(level: number): void;
}

export class AdaptiveQuality {
  pr: number; level = 0;
  private readonly max: number; private ceil: number; private frameMs = 16; private cool = 2; private sinceRaise = 99; private last = 0; private settle = 60; private readonly gaps: number[] = [];
  constructor(private readonly o: AdaptiveOptions) { this.max = o.max; this.pr = Math.min(o.max, o.start ?? 1.5); this.ceil = o.max; }
  /** 렌더 직전(또는 직후)에 프레임마다 한 번 호출합니다. */
  tick(): void {
    const now = performance.now(), real = this.last ? now - this.last : 16; this.last = now;
    if (real > 250) { this.gaps.length = 0; return; } // 탭 전환·일시정지·로딩은 세지 않음
    this.frameMs += (real - this.frameMs) * 0.08; this.cool -= real / 1000; this.sinceRaise += real / 1000;
    if (this.settle > 0) { this.settle--; return; }
    const floor = Math.min(0.75, this.max);
    if (this.cool <= 0) {
      const cap = Math.min(this.ceil, this.max); let next = this.pr;
      if (this.frameMs > 24 && this.pr > floor) { next = Math.max(floor, this.pr - (this.frameMs > 40 ? 0.5 : 0.25)); if (this.sinceRaise < 10) this.ceil = next; }
      else if (this.frameMs < 17.5 && this.pr < cap && this.level === 0) { next = Math.min(cap, this.pr + 0.25); this.sinceRaise = 0; }
      if (next !== this.pr) { this.pr = next; this.o.setPixelRatio(next); this.cool = 2; this.frameMs = 16; this.gaps.length = 0; return; }
    }
    if (this.pr > floor + 0.001 || this.level >= 3) { this.gaps.length = 0; return; }
    this.gaps.push(real); if (this.gaps.length < 60) return;
    const med = this.gaps.slice().sort((a, b) => a - b)[30]!; this.gaps.length = 0;
    if (med > 28) { this.level++; this.settle = 60; this.o.setLevel(this.level); }
  }
}
