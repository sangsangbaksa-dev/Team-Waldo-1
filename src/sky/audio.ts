import { AudioEngine, burst, tone } from '../audio-core';

export class SkyAudio {
  private eng = new AudioEngine();
  private last = new Map<string, number>();
  private motor: { osc: OscillatorNode; gain: GainNode; filt: BiquadFilterNode; noiseGain: GainNode; noiseFilt: BiquadFilterNode; noise: AudioBufferSourceNode } | null = null;

  get enabled(): boolean { return this.eng.enabled; }
  set enabled(on: boolean) { this.setEnabled(on); }
  setEnabled(on: boolean): void {
    this.eng.setEnabled(on);
    if (!on) this.stopEngine();
  }
  unlock(): void { this.eng.unlock(); }

  engine(on: boolean, thrust01: number): void {
    const c = this.eng.ctx, bus = this.eng.bus, noise = this.eng.noise;
    if (!c || !bus || !noise) return;
    if (!this.motor) {
      // Muted sessions should not start two permanent oscillator/noise sources
      // just to send them through a zero-gain bus. They start if sound is enabled.
      if (!on || !this.enabled) return;
      const osc = c.createOscillator(), filt = c.createBiquadFilter(), gain = c.createGain();
      const src = c.createBufferSource(), noiseFilt = c.createBiquadFilter(), noiseGain = c.createGain();
      osc.type = 'sawtooth'; osc.frequency.value = 48; filt.type = 'lowpass'; filt.frequency.value = 300; gain.gain.value = 0;
      src.buffer = noise; src.loop = true; noiseFilt.type = 'lowpass'; noiseFilt.frequency.value = 500; noiseGain.gain.value = 0;
      osc.connect(filt); filt.connect(gain); gain.connect(bus);
      src.connect(noiseFilt); noiseFilt.connect(noiseGain); noiseGain.connect(bus);
      this.eng.track(osc); this.eng.track(src); osc.start(); src.start();
      this.motor = { osc, gain, filt, noiseGain, noiseFilt, noise: src };
    }
    const m = this.motor, k = Math.max(0, Math.min(1, thrust01));
    m.gain.gain.setTargetAtTime(on && this.enabled ? 0.035 + k * 0.075 : 0, c.currentTime, 0.12);
    m.osc.frequency.setTargetAtTime(48 + k * 135, c.currentTime, 0.1);
    m.filt.frequency.setTargetAtTime(300 + k * 900, c.currentTime, 0.1);
    m.noiseGain.gain.setTargetAtTime(on && this.enabled ? k * 0.045 : 0, c.currentTime, 0.14);
    m.noiseFilt.frequency.setTargetAtTime(450 + k * 1500, c.currentTime, 0.14);
  }

  wind(speed01: number): void {
    const c = this.eng.ctx, m = this.motor;
    if (!c || !m) return;
    const k = Math.max(0, Math.min(1, speed01));
    m.noiseGain.gain.setTargetAtTime(this.enabled ? 0.012 + k * 0.04 : 0, c.currentTime, 0.16);
    m.noiseFilt.frequency.setTargetAtTime(500 + k * 1800, c.currentTime, 0.16);
  }

  /** The jet's looping oscillator and noise should not consume CPU beneath
   * pause/result dialogs. Keep the Web Audio context for one-shot UI sounds. */
  stopEngine(): void {
    const motor = this.motor;
    if (!motor) return;
    this.motor = null;
    for (const source of [motor.osc, motor.noise]) {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* context closed */ }
    }
    for (const node of [motor.filt, motor.gain, motor.noiseFilt, motor.noiseGain]) {
      try { node.disconnect(); } catch { /* context closed */ }
    }
  }

  dispose(): void {
    this.stopEngine();
    this.eng.dispose();
  }

  play(name: string, dist = 0): void {
    if (!this.eng.ctx || !this.enabled) return;
    const v = Math.max(0, Math.min(1, 1.1 - dist / 900));
    if (v < 0.06) return;
    const now = performance.now(), gap = name === 'gun' ? 55 : 40;
    if (now - (this.last.get(name) ?? 0) < gap) return;
    this.last.set(name, now);
    const t = (f: number, d: number, g: number, typ: OscillatorType = 'sine', slide = 0, delay = 0): void => tone(this.eng, f, d, g * v, typ, slide, delay);
    const n = (d: number, g: number, f: number, q = 1, typ: BiquadFilterType = 'bandpass'): void => burst(this.eng, d, g * v, f, q, typ);
    switch (name) {
      case 'gun': n(0.045, 0.34, 2200, 0.9); t(190, 0.05, 0.2, 'square', -90); break;
      case 'missile': n(0.42, 0.28, 900, 0.6, 'lowpass'); t(520, 0.4, 0.16, 'sawtooth', 900); break;
      case 'flare': n(0.22, 0.24, 1300, 0.8); t(680, 0.25, 0.13, 'triangle', -480); break;
      case 'boom': n(0.65, 0.7, 420, 0.5, 'lowpass'); t(58, 0.65, 0.58, 'sine', -30); break;
      case 'hit': n(0.055, 0.27, 3000, 2); t(1250, 0.06, 0.16, 'triangle', -350); break;
      case 'hurt': n(0.14, 0.3, 500, 0.7, 'lowpass'); t(180, 0.18, 0.24, 'sawtooth', -90); [660, 440].forEach((f, i) => t(f, 0.12, 0.12, 'square', 0, 0.12 + i * 0.16)); break;
      case 'lock': t(1100, 0.08, 0.16, 'sine'); break;
      case 'lockdone': [880, 1320].forEach((f, i) => t(f, 0.12, 0.18, 'triangle', 0, i * 0.13)); break;
      case 'warn': [880, 660, 880, 660].forEach((f, i) => t(f, 0.12, 0.16, 'square', 0, i * 0.18)); break;
      case 'wave': [440, 587, 784].forEach((f, i) => t(f, 0.22, 0.18, 'triangle', 0, i * 0.16)); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => t(f, 0.28, 0.19, 'triangle', 0, i * 0.12)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => t(f, 0.32, 0.18, 'sawtooth', 0, i * 0.17)); break;
    }
  }
}
