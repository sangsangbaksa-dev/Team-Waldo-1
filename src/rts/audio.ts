// FRONTLINE — Web Audio 합성 효과음. 외부 음원 없이 audio-core 의 톤·노이즈로만 만듭니다.
import { AudioEngine, burst, tone } from '../audio-core';

export type RtsSfx = 'select' | 'order' | 'error' | 'bullet' | 'rocket' | 'cannon' | 'boom' | 'bigboom' | 'place' | 'built' | 'trained' | 'alert' | 'deposit' | 'victory' | 'defeat' | 'click';

export class RtsAudio {
  private eng = new AudioEngine(); private last = new Map<string, number>();
  get enabled(): boolean { return this.eng.enabled; }
  set enabled(on: boolean) { this.eng.setEnabled(on); }
  unlock(): void { this.eng.unlock(); }
  dispose(): void { this.eng.dispose(); }
  /** 같은 소리가 한꺼번에 쏟아지지 않도록 종류별 최소 간격을 둡니다. */
  sfx(k: RtsSfx, vol = 1): void {
    const c = this.eng.ctx; if (!c || !this.eng.enabled) return;
    const gap: Partial<Record<RtsSfx, number>> = { bullet: 0.07, rocket: 0.12, cannon: 0.18, boom: 0.08, bigboom: 0.2, deposit: 0.1, alert: 3, select: 0.05, order: 0.05 };
    const now = c.currentTime, prev = this.last.get(k) ?? -9; if (now - prev < (gap[k] ?? 0)) return; this.last.set(k, now);
    const e = this.eng, v = vol;
    switch (k) {
      case 'click': tone(e, 520, 0.04, 0.12 * v, 'square'); break;
      case 'select': tone(e, 660, 0.05, 0.14 * v, 'triangle', 220); break;
      case 'order': tone(e, 440, 0.05, 0.12 * v, 'triangle'); tone(e, 580, 0.06, 0.12 * v, 'triangle', 0, 0.05); break;
      case 'error': tone(e, 160, 0.18, 0.2 * v, 'sawtooth', -50); break;
      case 'bullet': burst(e, 0.05, 0.16 * v, 2600, 1.2); tone(e, 900, 0.05, 0.07 * v, 'square', -500); break;
      case 'rocket': burst(e, 0.22, 0.16 * v, 700, 0.8, 'lowpass'); tone(e, 300, 0.2, 0.1 * v, 'sawtooth', -150); break;
      case 'cannon': burst(e, 0.3, 0.3 * v, 260, 0.6, 'lowpass'); tone(e, 110, 0.25, 0.28 * v, 'sine', -60); break;
      case 'boom': burst(e, 0.28, 0.24 * v, 520, 0.7, 'lowpass'); tone(e, 140, 0.2, 0.14 * v, 'sine', -80); break;
      case 'bigboom': burst(e, 0.8, 0.45 * v, 300, 0.5, 'lowpass'); tone(e, 70, 0.7, 0.4 * v, 'sine', -40); break;
      case 'place': tone(e, 330, 0.08, 0.16 * v, 'square'); burst(e, 0.12, 0.12 * v, 900, 1); break;
      case 'built': tone(e, 523, 0.14, 0.18 * v, 'triangle'); tone(e, 659, 0.14, 0.18 * v, 'triangle', 0, 0.12); tone(e, 784, 0.22, 0.18 * v, 'triangle', 0, 0.24); break;
      case 'trained': tone(e, 740, 0.1, 0.16 * v, 'triangle'); tone(e, 988, 0.16, 0.16 * v, 'triangle', 0, 0.09); break;
      case 'alert': tone(e, 360, 0.16, 0.24 * v, 'sawtooth'); tone(e, 360, 0.16, 0.24 * v, 'sawtooth', 0, 0.22); break;
      case 'deposit': tone(e, 1200, 0.05, 0.06 * v, 'sine', 400); break;
      case 'victory': [523, 659, 784, 1046].forEach((f, i) => tone(e, f, 0.3, 0.2 * v, 'triangle', 0, i * 0.16)); break;
      case 'defeat': [392, 330, 262, 196].forEach((f, i) => tone(e, f, 0.4, 0.2 * v, 'sawtooth', -20, i * 0.22)); break;
    }
  }
}
