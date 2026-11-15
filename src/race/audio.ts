// SPEED RUSH — Web Audio 합성 사운드(엔진·바람·스키드·부스트·효과음·짧은 BGM). 외부 음원 없음.
import { AudioEngine, burst, tone } from '../audio-core';

const GEARS = [0, 20, 36, 51, 65, 79, 120];
/** 속도(m/s)에 해당하는 기어. 오디오가 아직 켜지지 않아도 HUD 가 같은 단수를 씁니다. */
export function gearFor(speedMs: number): number {
  const v = Math.abs(speedMs); let g = 1; while (g < GEARS.length - 1 && v > GEARS[g]) g++; return g;
}

export class RaceAudio {
  private eng = new AudioEngine();
  private motor: { o1: OscillatorNode; o2: OscillatorNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  private wind: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  private skid: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  private boostG: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  private bed: number | null = null;
  private bedStep = 0;
  private done = false;
  private lastSfx = new Map<string, number>();
  gear = 1; private lastShift = 0;
  get enabled(): boolean { return this.eng.enabled; }
  set enabled(on: boolean) { this.eng.setEnabled(on); }
  get ctx(): AudioContext | null { return this.eng.ctx; }
  get master(): GainNode | null { return this.eng.master; }

  unlock(): void {
    const c = this.eng.unlock();
    if (!c || !this.eng.bus || this.motor) return;
    const dest = this.eng.bus;
    const shaper = c.createWaveShaper(), curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.4); }
    shaper.curve = curve;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), filt = c.createBiquadFilter(), gain = c.createGain(), mix = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; filt.type = 'lowpass'; filt.frequency.value = 700; gain.gain.value = 0; mix.gain.value = 0.5;
    o1.connect(mix); o2.connect(mix); mix.connect(shaper); shaper.connect(filt); filt.connect(gain); gain.connect(dest);
    this.eng.track(o1); this.eng.track(o2); o1.start(); o2.start();
    this.motor = { o1, o2, filt, gain };
    const loop = (type: BiquadFilterType, f: number, q: number): { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode } => {
      const s = c.createBufferSource(), filt2 = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.eng.noise; s.loop = true; filt2.type = type; filt2.frequency.value = f; filt2.Q.value = q; g.gain.value = 0;
      s.connect(filt2); filt2.connect(g); g.connect(dest);
      this.eng.track(s); s.start();
      return { src: s, filt: filt2, gain: g };
    };
    this.wind = loop('highpass', 900, 0.6);
    this.skid = loop('bandpass', 1700, 4);
    this.boostG = loop('bandpass', 600, 0.8);
    this.bed = window.setInterval(() => this.tickBed(), 320);
  }
  setEnabled(on: boolean): void { this.enabled = on; this.eng.setEnabled(on); }
  dispose(): void {
    if (this.bed !== null) { clearInterval(this.bed); this.bed = null; }
    for (const src of [this.motor?.o1, this.motor?.o2, this.wind?.src, this.skid?.src, this.boostG?.src]) {
      try { src?.stop(); } catch { /* already stopped */ }
    }
    this.motor = this.wind = this.skid = this.boostG = null;
    this.eng.dispose();
  }

  /** 매 프레임: 속도(m/s), 가속 입력, 옆미끄러짐(rad), 부스트 여부 */
  drive(speed: number, throttle: number, slip: number, boost: boolean, drifting: boolean, wall: boolean): void {
    const c = this.eng.ctx; if (!c || !this.motor || !this.wind || !this.skid || !this.boostG) return;
    const t = c.currentTime, v = this.done ? 0 : Math.abs(speed);
    const thr = this.done ? 0 : throttle, go = this.enabled && !this.done;
    const g = gearFor(v);
    if (g !== this.gear) { if (g > this.gear) this.lastShift = t; this.gear = g; }
    const lo = GEARS[g - 1], hi = GEARS[g], rpm = 0.18 + 0.82 * Math.min(1, Math.max(0, (v - lo) / (hi - lo))) - (t - this.lastShift < 0.12 ? 0.18 : 0);
    const f = 48 + rpm * 190 + (go && boost ? 24 : 0);
    this.motor.o1.frequency.setTargetAtTime(f, t, 0.03); this.motor.o2.frequency.setTargetAtTime(f * 1.505, t, 0.03);
    this.motor.filt.frequency.setTargetAtTime(380 + rpm * 1700 + thr * 700, t, 0.05);
    this.motor.gain.gain.setTargetAtTime(go ? 0.16 + thr * 0.16 + rpm * 0.08 : 0, t, 0.05);
    this.wind.gain.gain.setTargetAtTime(go ? Math.pow(Math.min(1, v / 90), 2) * 0.28 : 0, t, 0.1);
    this.wind.filt.frequency.setTargetAtTime(500 + v * 14, t, 0.1);
    const sk = (drifting ? 0.2 : 0) + Math.max(0, Math.abs(slip) - 0.14) * 1.1 + (wall ? 0.15 : 0);
    this.skid.gain.gain.setTargetAtTime(go ? Math.min(0.28, sk) * (v > 8 ? 1 : 0) : 0, t, 0.05);
    this.skid.filt.frequency.setTargetAtTime(1300 + Math.abs(slip) * 1800, t, 0.1);
    this.boostG.gain.gain.setTargetAtTime(go && boost ? 0.24 : 0, t, boost ? 0.04 : 0.2);
  }

  sfx(name: 'count' | 'go' | 'lap' | 'best' | 'hit' | 'bump' | 'pad' | 'drift' | 'finish' | 'click', power = 1): void {
    if (!this.eng.ctx || !this.enabled) return;
    // hit/bump can be emitted twice in one frame (wall + car shove) or every step while cars grind.
    const gap = name === 'hit' || name === 'bump' ? 150 : 0;
    if (gap) {
      const now = performance.now();
      if (now - (this.lastSfx.get(name) ?? 0) < gap) return;
      this.lastSfx.set(name, now);
    }
    switch (name) {
      case 'count': tone(this.eng, 520, 0.16, 0.28, 'square'); break;
      case 'go': tone(this.eng, 1040, 0.4, 0.32, 'square'); tone(this.eng, 1560, 0.4, 0.16, 'sawtooth'); this.done = false; break;
      case 'lap': tone(this.eng, 660, 0.11, 0.24, 'triangle'); tone(this.eng, 990, 0.18, 0.24, 'triangle', 0, 0.1); break;
      case 'best': tone(this.eng, 660, 0.11, 0.24, 'triangle'); tone(this.eng, 880, 0.11, 0.24, 'triangle', 0, 0.1); tone(this.eng, 1320, 0.26, 0.24, 'triangle', 0, 0.2); break;
      case 'hit': burst(this.eng, 0.3, Math.min(0.7, 0.24 + power * 0.03), 600, 0.8, 'lowpass'); tone(this.eng, 90, 0.22, Math.min(0.45, 0.2 + power * 0.025), 'sine', -50); break;
      case 'bump': burst(this.eng, 0.13, 0.32, 900, 0.8, 'lowpass'); tone(this.eng, 130, 0.1, 0.22, 'square', -60); break;
      case 'pad': tone(this.eng, 300, 0.45, 0.24, 'sawtooth', 1400); burst(this.eng, 0.45, 0.28, 3000, 0.7, 'highpass'); break;
      case 'drift': tone(this.eng, 500, 0.26, 0.24, 'sawtooth', 1200); burst(this.eng, 0.35, 0.24, 2500, 0.7, 'highpass'); break;
      case 'finish': this.done = true; this.drive(0, 0, 0, false, false, false);
        for (let i = 0; i < 4; i++) tone(this.eng, 523 * [1, 1.25, 1.5, 2][i], 0.32, 0.24, 'triangle', 0, i * 0.12);
        break;
      case 'click': tone(this.eng, 700, 0.05, 0.16, 'square'); break;
    }
  }

  private tickBed(): void {
    const c = this.eng.ctx;
    if (!c || !this.enabled || this.done || c.state !== 'running') return;
    const s = this.bedStep++ % 8;
    const notes = [196, 0, 246.94, 0, 220, 0, 293.66, 0];
    const f = notes[s];
    if (f) tone(this.eng, f, 0.28, 0.045, 'triangle', 4);
  }
}
