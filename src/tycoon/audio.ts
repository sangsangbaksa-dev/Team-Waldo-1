// TYCOON 사운드: 효과음과 도시 환경음(차 소리·비)을 합성합니다. 파일 없이 발진기/노이즈만 씁니다.
import { AudioEngine, burst, tone } from '../audio-core';

type Loop = { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
export class TycoonAudio {
  private eng = new AudioEngine();
  private city: Loop | null = null; private rain: Loop | null = null; private wind: Loop | null = null; private motor: { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null; private disposed = false;
  private lastStep = 0; private lastMotorAt = -1; private lastMotorActive = false; private lastAmbienceAt = -1;
  get enabled(): boolean { return this.eng.enabled; }
  set enabled(on: boolean) { this.eng.setEnabled(on); }
  unlock(): void {
    if (this.disposed) return; const c = this.eng.unlock(), dest = this.eng.bus; if (!c || !dest || this.city) return;
    const mk = (type: BiquadFilterType, f: number, q: number): Loop => {
      const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(); src.buffer = this.eng.noise; src.loop = true; filter.type = type; filter.frequency.value = f; filter.Q.value = q; gain.gain.value = 0;
      src.connect(filter); filter.connect(gain); gain.connect(dest); src.start(); this.eng.track(src); return { src, filter, gain };
    };
    this.city = mk('lowpass', 420, 0.6); this.rain = mk('highpass', 1800, 0.4); this.wind = mk('bandpass', 260, 0.8);
  }
  /** Create the engine voice on demand, keeping pedestrian scenes CPU-light. */
  private ensureMotor(): void {
    if (this.motor) return;
    const c = this.eng.ctx, dest = this.eng.bus;
    if (!c || !dest) return;
    const osc = c.createOscillator(), filter = c.createBiquadFilter(), gain = c.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 48;
    filter.type = 'lowpass'; filter.frequency.value = 110; filter.Q.value = 0.7; gain.gain.value = 0;
    osc.connect(filter); filter.connect(gain); gain.connect(dest);
    osc.start(); this.eng.track(osc); this.motor = { osc, filter, gain };
  }
  /** 환경음: 낮엔 도시 소음, 밤엔 잔잔하게, 비 오면 빗소리. */
  ambience(daylight: number, rain: number, near: number): void {
    const c = this.eng.ctx; if (!c) return; const t = c.currentTime;
    if (t - this.lastAmbienceAt < 0.1) return;
    this.lastAmbienceAt = t;
    for (const source of [this.city, this.rain, this.wind]) source?.gain.gain.cancelScheduledValues(t);
    this.city?.gain.gain.setTargetAtTime((0.05 + daylight * 0.07) * (1 - rain * 0.3) + near * 0.02, t, 0.5);
    this.rain?.gain.gain.setTargetAtTime(rain * 0.07, t, 0.8); this.wind?.gain.gain.setTargetAtTime(0.02 + rain * 0.03, t, 0.8);
  }
  drive(speed: number, active: boolean): void {
    if (active) this.ensureMotor();
    const c = this.eng.ctx, motor = this.motor;
    if (!c || !motor) return;
    const t = c.currentTime;
    if (t - this.lastMotorAt < 0.085 && active === this.lastMotorActive) return;
    this.lastMotorAt = t; this.lastMotorActive = active;
    motor.osc.frequency.cancelScheduledValues(t);
    motor.filter.frequency.cancelScheduledValues(t);
    motor.gain.gain.cancelScheduledValues(t);
    motor.osc.frequency.setTargetAtTime(48 + Math.min(120, speed * 4.8), t, 0.16);
    motor.filter.frequency.setTargetAtTime(140 + Math.min(600, speed * 17), t, 0.18);
    motor.gain.gain.setTargetAtTime(active ? 0.042 + Math.min(0.055, speed * 0.002) : 0, t, 0.13);
  }
  step(speed: number, now: number): void { if (speed < 0.5 || now - this.lastStep < (speed > 4.5 ? 0.27 : 0.4)) return; this.lastStep = now; burst(this.eng, 0.05, 0.1, 340, 1.2); }
  honk(): void { tone(this.eng, 335, 0.22, 0.085, 'sawtooth'); tone(this.eng, 415, 0.19, 0.065, 'sawtooth'); }
  impact(): void { burst(this.eng, 0.19, 0.18, 145, 0.6, 'lowpass'); }
  click(): void { tone(this.eng, 720, 0.05, 0.14, 'triangle'); }
  deny(): void { tone(this.eng, 160, 0.14, 0.2, 'square', -50); }
  open(): void { tone(this.eng, 520, 0.08, 0.14, 'sine', 160); }
  coin(amount: number): void { const k = Math.min(1, Math.log10(Math.max(10, amount)) / 6); tone(this.eng, 880 + k * 300, 0.09, 0.2, 'square'); tone(this.eng, 1320 + k * 400, 0.16, 0.18, 'square', 0, 0.07); }
  spend(): void { tone(this.eng, 440, 0.09, 0.15, 'triangle', -120); }
  good(): void { tone(this.eng, 660, 0.12, 0.16, 'sine', 120); }
  bad(): void { tone(this.eng, 220, 0.18, 0.2, 'sawtooth', -90); }
  stageUp(): void { [523, 659, 784, 1047].forEach((f, i) => tone(this.eng, f, 0.5, 0.2, 'triangle', 0, i * 0.14)); burst(this.eng, 0.9, 0.12, 2400, 0.6, 'highpass'); }
  day(): void { tone(this.eng, 392, 0.4, 0.12, 'sine'); tone(this.eng, 523, 0.5, 0.12, 'sine', 0, 0.18); }
  thunder(): void { burst(this.eng, 1.6, 0.35, 120, 0.7, 'lowpass'); }
  dispose(): void { this.disposed = true; this.eng.dispose(); }
}
