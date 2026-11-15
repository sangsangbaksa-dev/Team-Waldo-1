// LAST CITY — Web Audio 합성 효과음·환경음 (외부 음원 없음)
import { AudioEngine, burst, tone } from '../audio-core';

export class CityAudio {
  private eng = new AudioEngine();
  last = new Map<string, number>();
  engine: { osc: OscillatorNode; filt: BiquadFilterNode; gain: GainNode } | null = null;
  rumble: { filt: BiquadFilterNode; gain: GainNode; src: AudioBufferSourceNode } | null = null;
  music: number | null = null;
  step = 0;
  intensity = 0;
  get enabled(): boolean { return this.eng.enabled; }
  set enabled(on: boolean) { this.eng.setEnabled(on); }
  get ctx(): AudioContext | null { return this.eng.ctx; }
  get master(): GainNode | null { return this.eng.master; }

  unlock(): void {
    const c = this.eng.unlock();
    if (!c || !this.eng.bus || this.music !== null) return;
    this.music = window.setInterval(() => this.tick(), 210);
    this.startRumble(c);
  }
  setEnabled(on: boolean): void { this.eng.setEnabled(on); }
  dispose(): void {
    if (this.music !== null) { clearInterval(this.music); this.music = null; }
    try { this.engine?.osc.stop(); } catch { /* already stopped */ }
    try { this.rumble?.src.stop(); } catch { /* already stopped */ }
    this.engine = null;
    this.rumble = null;
    this.eng.dispose();
  }

  private startRumble(c: AudioContext): void {
    if (this.rumble || !this.eng.bus || !this.eng.noise) return;
    const src = c.createBufferSource(), filt = c.createBiquadFilter(), gain = c.createGain();
    src.buffer = this.eng.noise; src.loop = true;
    filt.type = 'lowpass'; filt.frequency.value = 180; filt.Q.value = 0.7;
    gain.gain.value = 0.05;
    src.connect(filt); filt.connect(gain); gain.connect(this.eng.bus);
    this.eng.track(src);
    src.start();
    this.rumble = { filt, gain, src };
  }

  play(name: string, vol = 1): void {
    if (!this.eng.ctx || !this.enabled || vol < 0.03) return;
    const now = performance.now();
    const gap = name === 'smg' || name === 'rifle' ? 45 : name === 'skid' || name === 'hurt' || name === 'phurt' ? 180 : 60;
    if (now - (this.last.get(name) ?? 0) < gap) return;
    this.last.set(name, now);
    const v = vol, t = (f: number, d: number, g: number, typ: OscillatorType = 'sine', slide = 0, delay = 0): void => tone(this.eng, f, d, g, typ, slide, delay);
    const n = (d: number, g: number, f: number, q = 1, typ: BiquadFilterType = 'bandpass'): void => burst(this.eng, d, g, f, q, typ);
    switch (name) {
      case 'pistol': n(0.08, 0.42 * v, 1800, 0.8); t(220, 0.06, 0.2 * v, 'square', -120); break;
      case 'smg': n(0.05, 0.32 * v, 2400, 0.9); t(180, 0.04, 0.14 * v, 'square', -80); break;
      case 'rifle': n(0.09, 0.42 * v, 1400, 0.7); t(150, 0.07, 0.24 * v, 'sawtooth', -90); break;
      case 'shotgun': n(0.2, 0.62 * v, 900, 0.5); t(110, 0.14, 0.32 * v, 'sawtooth', -70); break;
      case 'sniper': n(0.26, 0.55 * v, 700, 0.4); t(300, 0.22, 0.28 * v, 'sawtooth', -250); break;
      case 'rocket': n(0.35, 0.38 * v, 500, 0.6, 'lowpass'); t(140, 0.35, 0.2 * v, 'sawtooth', 200); break;
      case 'cannon': n(0.3, 0.7 * v, 300, 0.5, 'lowpass'); t(80, 0.26, 0.45 * v, 'sine', -50); break;
      case 'rail': t(1800, 0.3, 0.24 * v, 'sawtooth', -1700); n(0.18, 0.32 * v, 4000, 2); break;
      case 'boom': n(0.55, 0.7 * v, 220, 0.4, 'lowpass'); t(70, 0.4, 0.5 * v, 'sine', -45); break;
      case 'hit': n(0.04, 0.16 * v, 3200, 2); break;
      case 'death': t(200, 0.18, 0.16 * v, 'triangle', -140); break;
      case 'cash': t(1320, 0.08, 0.18 * v, 'square'); t(1760, 0.14, 0.18 * v, 'square', 0, 0.08); break;
      case 'pickup': t(660, 0.07, 0.2 * v, 'triangle', 300); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => t(f, 0.16, 0.2, 'triangle', 0, i * 0.08)); break;
      case 'quest': [784, 988, 1175].forEach((f, i) => t(f, 0.14, 0.18, 'square', 0, i * 0.07)); break;
      case 'error': t(160, 0.12, 0.2, 'square', -40); break;
      case 'click': t(900, 0.03, 0.12, 'square'); break;
      case 'build': n(0.13, 0.28 * v, 600, 1); t(330, 0.1, 0.16 * v, 'triangle', 110); break;
      case 'siren': for (let i = 0; i < 3; i++) { t(620, 0.26, 0.16, 'sawtooth', 320, i * 0.56); t(940, 0.26, 0.16, 'sawtooth', -320, i * 0.56 + 0.28); } break;
      case 'wail': t(700, 0.5, 0.1, 'sawtooth', 500); t(1200, 0.5, 0.1, 'sawtooth', -500, 0.5); t(700, 0.5, 0.1, 'sawtooth', 500, 1); break;
      case 'announce': t(392, 0.26, 0.2, 'triangle'); t(587, 0.35, 0.2, 'triangle', 0, 0.15); break;
      case 'crash': n(0.18, 0.55 * v, 800, 0.4); t(90, 0.14, 0.28 * v, 'sine', -40); break;
      case 'reload': t(500, 0.03, 0.12, 'square'); t(700, 0.03, 0.12, 'square', 0, 0.12); break;
      case 'dash': n(0.13, 0.2, 1200, 0.5, 'highpass'); break;
      case 'door': t(140, 0.07, 0.24, 'square', -60); break;
      case 'win': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => t(f, 0.3, 0.2, 'triangle', 0, i * 0.11)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => t(f, 0.35, 0.2, 'sawtooth', 0, i * 0.18)); break;
      case 'crystal': t(880, 0.06, 0.14 * v, 'triangle', 80); t(1320, 0.1, 0.12 * v, 'triangle', 0, 0.06); break;
      case 'heal': t(392, 0.12, 0.14 * v, 'sine', 80); t(523, 0.18, 0.14 * v, 'sine', 40, 0.08); break;
      case 'hurt': n(0.08, 0.22 * v, 700, 0.8, 'lowpass'); t(180, 0.1, 0.16 * v, 'triangle', -80); break;
      case 'skid': n(0.16, 0.18 * v, 1600, 3); break;
      case 'splat': n(0.12, 0.28 * v, 400, 0.7, 'lowpass'); t(110, 0.1, 0.16 * v, 'sine', -50); break;
      case 'burn': n(0.4, 0.22 * v, 500, 0.6, 'lowpass'); t(90, 0.3, 0.12 * v, 'sawtooth', 40); break;
      case 'spawn': t(440, 0.06, 0.14 * v, 'square', 220); t(660, 0.08, 0.12 * v, 'triangle', 0, 0.05); break;
      case 'roar': t(70, 0.45, 0.28 * v, 'sawtooth', -20); n(0.4, 0.22 * v, 180, 0.5, 'lowpass'); break;
      case 'poof': n(0.12, 0.2 * v, 900, 0.8, 'highpass'); t(240, 0.08, 0.1 * v, 'triangle', -120); break;
      case 'crate': t(200, 0.08, 0.16 * v, 'square', -40); t(520, 0.14, 0.16 * v, 'triangle', 180, 0.08); break;
    }
  }

  /** 차량 엔진음: speed 0..1, 탑승 안 하면 -1 */
  setEngine(speed: number): void {
    const c = this.eng.ctx, dest = this.eng.bus; if (!c || !dest) return;
    const t = c.currentTime;
    if (speed < 0) {
      if (this.engine) this.engine.gain.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    if (!this.engine) {
      const osc = c.createOscillator(), filt = c.createBiquadFilter(), gain = c.createGain();
      osc.type = 'sawtooth'; filt.type = 'lowpass'; filt.frequency.value = 420; gain.gain.value = 0;
      osc.connect(filt); filt.connect(gain); gain.connect(dest);
      this.eng.track(osc); osc.start();
      this.engine = { osc, filt, gain };
    }
    this.engine.osc.frequency.setTargetAtTime(52 + speed * 130, t, 0.08);
    this.engine.filt.frequency.setTargetAtTime(320 + speed * 420, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(this.enabled ? 0.07 + speed * 0.06 : 0, t, 0.08);
  }

  private tick(): void {
    const c = this.eng.ctx;
    if (!c || !this.enabled || c.state !== 'running') return;
    if (this.rumble) this.rumble.gain.gain.setTargetAtTime(0.04 + this.intensity * 0.03, c.currentTime, 0.2);
    const s = this.step++ % 16;
    const bass = [55, 55, 0, 55, 65.4, 0, 55, 0, 49, 49, 0, 49, 73.4, 0, 65.4, 0][s];
    if (bass) tone(this.eng, bass, 0.18, 0.08, 'triangle');
    if (this.intensity < 0.25 && s === 4) tone(this.eng, 392, 0.28, 0.04, 'sine', 8);
    if (this.intensity < 0.25 && s === 12) tone(this.eng, 523.25, 0.32, 0.035, 'sine', -6);
    if (this.intensity > 0.3 && s % 2 === 0) burst(this.eng, 0.03, 0.04, 7000, 1, 'highpass');
    if (this.intensity > 0.6 && s % 4 === 0) tone(this.eng, 90, 0.1, 0.12, 'sine', -50);
  }
}
