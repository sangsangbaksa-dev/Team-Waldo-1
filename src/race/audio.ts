// SPEED RUSH — Web Audio 합성 사운드(엔진 기어 변속, 바람, 타이어 스키드, 효과음). 외부 음원 없음.
const GEARS = [0, 20, 36, 51, 65, 79, 120];

export class RaceAudio {
  private ctx: AudioContext | null = null; private master: GainNode | null = null; private noise: AudioBuffer | null = null;
  private eng: { o1: OscillatorNode; o2: OscillatorNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  private wind: { filt: BiquadFilterNode; gain: GainNode } | null = null; private skid: { filt: BiquadFilterNode; gain: GainNode } | null = null;
  private boostG: { filt: BiquadFilterNode; gain: GainNode } | null = null;
  enabled = true; gear = 1; private lastShift = 0;

  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; const c = (this.ctx = new AC());
      this.master = c.createGain(); this.master.gain.value = this.enabled ? 0.55 : 0; this.master.connect(c.destination);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const shaper = c.createWaveShaper(), curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.6); } shaper.curve = curve;
      const o1 = c.createOscillator(), o2 = c.createOscillator(), filt = c.createBiquadFilter(), gain = c.createGain(), mix = c.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; filt.type = 'lowpass'; filt.frequency.value = 700; gain.gain.value = 0; mix.gain.value = 0.5;
      o1.connect(mix); o2.connect(mix); mix.connect(shaper); shaper.connect(filt); filt.connect(gain); gain.connect(this.master); o1.start(); o2.start();
      this.eng = { o1, o2, filt, gain };
      const loop = (type: BiquadFilterType, f: number, q: number): { filt: BiquadFilterNode; gain: GainNode } => {
        const s = c.createBufferSource(), filt2 = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; s.loop = true; filt2.type = type; filt2.frequency.value = f; filt2.Q.value = q; g.gain.value = 0;
        s.connect(filt2); filt2.connect(g); g.connect(this.master as GainNode); s.start(); return { filt: filt2, gain: g };
      };
      this.wind = loop('highpass', 900, 0.6); this.skid = loop('bandpass', 1700, 4); this.boostG = loop('bandpass', 600, 0.8);
    } catch { this.ctx = null; }
  }
  setEnabled(on: boolean): void { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.55 : 0; }
  dispose(): void { try { this.eng?.o1.stop(); this.eng?.o2.stop(); } catch { /* 이미 정지됨 */ } void this.ctx?.close(); this.ctx = null; }

  /** 매 프레임: 속도(m/s), 가속 입력, 옆미끄러짐(rad), 부스트 여부 */
  drive(speed: number, throttle: number, slip: number, boost: boolean, drifting: boolean, wall: boolean): void {
    const c = this.ctx; if (!c || !this.eng || !this.wind || !this.skid || !this.boostG) return; const t = c.currentTime, v = Math.abs(speed);
    let g = 1; while (g < GEARS.length - 1 && v > GEARS[g]) g++;
    if (g !== this.gear) { if (g > this.gear) this.lastShift = t; this.gear = g; }
    const lo = GEARS[g - 1], hi = GEARS[g], rpm = 0.18 + 0.82 * Math.min(1, Math.max(0, (v - lo) / (hi - lo))) - (t - this.lastShift < 0.12 ? 0.18 : 0);
    const f = 48 + rpm * 190 + (boost ? 24 : 0);
    this.eng.o1.frequency.setTargetAtTime(f, t, 0.03); this.eng.o2.frequency.setTargetAtTime(f * 1.505, t, 0.03);
    this.eng.filt.frequency.setTargetAtTime(380 + rpm * 1700 + throttle * 700, t, 0.05);
    this.eng.gain.gain.setTargetAtTime(0.18 + throttle * 0.2 + rpm * 0.1, t, 0.05);
    this.wind.gain.gain.setTargetAtTime(Math.pow(Math.min(1, v / 90), 2) * 0.36, t, 0.1); this.wind.filt.frequency.setTargetAtTime(500 + v * 14, t, 0.1);
    const sk = (drifting ? 0.2 : 0) + Math.max(0, Math.abs(slip) - 0.14) * 1.1 + (wall ? 0.15 : 0);
    this.skid.gain.gain.setTargetAtTime(Math.min(0.32, sk) * (v > 8 ? 1 : 0), t, 0.05); this.skid.filt.frequency.setTargetAtTime(1300 + Math.abs(slip) * 1800, t, 0.1);
    this.boostG.gain.gain.setTargetAtTime(boost ? 0.3 : 0, t, boost ? 0.04 : 0.2);
  }
  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 0, delay = 0): void {
    const c = this.ctx; if (!c || !this.master) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
  }
  private burst(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass'): void {
    const c = this.ctx; if (!c || !this.master || !this.noise) return; const t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.03);
  }
  sfx(name: 'count' | 'go' | 'lap' | 'best' | 'hit' | 'bump' | 'pad' | 'drift' | 'finish' | 'click', power = 1): void {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'count': this.tone(520, 0.18, 0.35, 'square'); break;
      case 'go': this.tone(1040, 0.45, 0.4, 'square'); this.tone(1560, 0.45, 0.2, 'sawtooth'); break;
      case 'lap': this.tone(660, 0.12, 0.3, 'triangle'); this.tone(990, 0.2, 0.3, 'triangle', 0, 0.1); break;
      case 'best': this.tone(660, 0.12, 0.3, 'triangle'); this.tone(880, 0.12, 0.3, 'triangle', 0, 0.1); this.tone(1320, 0.3, 0.3, 'triangle', 0, 0.2); break;
      case 'hit': this.burst(0.35, Math.min(1, 0.3 + power * 0.04), 600); this.tone(90, 0.25, Math.min(0.8, 0.25 + power * 0.03), 'sine', -50); break;
      case 'bump': this.burst(0.15, 0.4, 900); this.tone(130, 0.12, 0.3, 'square', -60); break;
      case 'pad': this.tone(300, 0.5, 0.3, 'sawtooth', 1400); this.burst(0.5, 0.35, 3000, 'highpass'); break;
      case 'drift': this.tone(500, 0.3, 0.3, 'sawtooth', 1200); this.burst(0.4, 0.3, 2500, 'highpass'); break;
      case 'finish': for (let i = 0; i < 4; i++) this.tone(523 * [1, 1.25, 1.5, 2][i], 0.35, 0.3, 'triangle', 0, i * 0.12); break;
      case 'click': this.tone(700, 0.05, 0.2, 'square'); break;
    }
  }
}
