// ZERO ZONE — Web Audio 합성 효과음(외부 음원 없음). 총소리는 거리에 따라 작아집니다.
import { AudioEngine, burst, tone } from '../audio-core';

export class ShooterAudio {
  private eng = new AudioEngine(); private last = new Map<string, number>(); private wind: { gain: GainNode; filt: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;
  get enabled(): boolean { return this.eng.enabled; }
  set enabled(on: boolean) { this.eng.enabled = on; }
  setEnabled(on: boolean): void { this.eng.setEnabled(on); }
  unlock(): void {
    const c = this.eng.unlock(); if (!c || !this.eng.bus || !this.eng.noise || this.wind) return;
    const src = c.createBufferSource(), filt = c.createBiquadFilter(), gain = c.createGain(); src.buffer = this.eng.noise; src.loop = true; filt.type = 'bandpass'; filt.frequency.value = 420; filt.Q.value = 0.5; gain.gain.value = 0.035;
    src.connect(filt); filt.connect(gain); gain.connect(this.eng.bus); this.eng.track(src); src.start(); this.wind = { gain, filt, src };
  }
  /** 자기장 밖에 있을 때 바람 소리를 키워 위험을 알립니다. 0~1 */
  danger(level: number): void { const c = this.eng.ctx; if (this.wind && c) { this.wind.gain.gain.setTargetAtTime(0.035 + level * 0.06, c.currentTime, 0.3); this.wind.filt.frequency.setTargetAtTime(420 + level * 500, c.currentTime, 0.3); } }
  dispose(): void { try { this.wind?.src.stop(); } catch { /* 이미 멈춤 */ } this.wind = null; this.eng.dispose(); }

  /** dist: 소리가 난 곳까지의 미터 거리(0이면 내 총소리) */
  play(name: string, dist = 0, suppressed = false): void {
    if (!this.eng.ctx || !this.enabled) return;
    const v = Math.max(0, Math.min(1, 1.1 - dist / (suppressed ? 65 : 170))) * (suppressed ? 0.3 : 1); if (v < 0.06) return;
    const now = performance.now(), gap = name === 'smg' || name === 'rifle' ? 45 : name === 'hurt' ? 120 : 40; if (now - (this.last.get(name) ?? 0) < gap) return; this.last.set(name, now);
    const t = (f: number, d: number, g: number, typ: OscillatorType = 'sine', slide = 0, delay = 0): void => tone(this.eng, f, d, g * v, typ, slide, delay);
    const n = (d: number, g: number, f: number, q = 1, typ: BiquadFilterType = 'bandpass'): void => burst(this.eng, suppressed ? d * 0.6 : d, g * v, suppressed ? f * 0.45 : f, q, typ);
    switch (name) {
      case 'pistol': n(0.08, 0.42, 1800, 0.8); t(220, 0.06, 0.2, 'square', -120); break;
      case 'smg': n(0.05, 0.32, 2400, 0.9); t(180, 0.04, 0.14, 'square', -80); break;
      case 'rifle': n(0.09, 0.42, 1400, 0.7); t(150, 0.07, 0.24, 'sawtooth', -90); break;
      case 'shotgun': n(0.2, 0.62, 900, 0.5); t(110, 0.14, 0.32, 'sawtooth', -70); break;
      case 'sniper': n(0.26, 0.55, 700, 0.4); t(300, 0.22, 0.28, 'sawtooth', -250); n(0.5, 0.15, 300, 0.5, 'lowpass'); break;
      case 'reload': t(500, 0.03, 0.12, 'square'); t(700, 0.03, 0.12, 'square', 0, 0.14); t(420, 0.04, 0.12, 'square', 0, 0.9); break;
      case 'empty': t(900, 0.03, 0.12, 'square'); break;
      case 'hitmark': n(0.04, 0.2, 3200, 2); t(1500, 0.04, 0.1, 'triangle'); break;
      case 'headshot': n(0.05, 0.25, 3600, 2); t(2100, 0.07, 0.14, 'triangle'); break;
      case 'hurt': n(0.09, 0.26, 700, 0.8, 'lowpass'); t(170, 0.12, 0.18, 'triangle', -80); break;
      case 'kill': t(880, 0.08, 0.16, 'triangle'); t(1320, 0.14, 0.16, 'triangle', 0, 0.07); break;
      case 'pickup': t(660, 0.07, 0.2, 'triangle', 300); break;
      case 'heal': t(392, 0.12, 0.16, 'sine', 80); t(523, 0.18, 0.16, 'sine', 40, 0.08); break;
      case 'armor': n(0.1, 0.25, 600, 1); t(330, 0.1, 0.16, 'triangle', 110); break;
      case 'zone': [392, 330, 392].forEach((f, i) => t(f, 0.22, 0.16, 'sawtooth', 0, i * 0.24)); break;
      case 'count': t(660, 0.1, 0.2, 'square'); break;
      case 'go': t(990, 0.28, 0.22, 'square'); break;
      case 'win': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => t(f, 0.3, 0.2, 'triangle', 0, i * 0.11)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => t(f, 0.35, 0.2, 'sawtooth', 0, i * 0.18)); break;
    }
  }
}
