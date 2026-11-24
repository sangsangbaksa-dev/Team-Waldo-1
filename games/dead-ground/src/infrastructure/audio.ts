import type { MatchEvent } from '../domain/match.js';
import { horizontalDistance, type Vec3 } from '../domain/math.js';

export class FieldAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private wind?: GainNode;
  private noise?: AudioBuffer;
  private muted = false;
  private stepAt = 0;

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      const ctx = this.context;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      this.master.connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const atmosphere = ctx.createBufferSource();
      atmosphere.buffer = this.noise;
      atmosphere.loop = true;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 184;
      this.wind = ctx.createGain();
      this.wind.gain.value = 0;
      atmosphere.connect(lowpass).connect(this.wind).connect(this.master);
      atmosphere.start();
    }
    void this.context.resume().catch(() => {});
  }

  setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.context && this.master) this.master.gain.setTargetAtTime(mute ? 0 : 0.62, this.context.currentTime, 0.035);
  }

  ambiance(active: boolean): void {
    if (this.context && this.wind) this.wind.gain.setTargetAtTime(active ? 0.12 : 0, this.context.currentTime, 0.2);
  }

  event(event: MatchEvent, self: string, position: Vec3, yaw: number): void {
    if (!this.context) return;
    const own = event.player === self;
    if (event.type === 'shot') {
      const distance = horizontalDistance(position, event.position);
      const level = own ? 0.68 : Math.max(0, 0.78 - Math.log1p(distance) * 0.098);
      const right = (event.position.x - position.x) * Math.cos(yaw) - (event.position.z - position.z) * Math.sin(yaw);
      const pan = own ? 0 : Math.max(-0.92, Math.min(0.92, right / Math.max(1, distance)));
      const delay = own ? 0 : Math.min(0.68, distance / 350);
      this.burst(level, own ? 4800 : 1800 - Math.min(1400, distance * 4), own ? 0.24 : 0.43, delay, pan);
      this.burst(level * 0.53, 175, 0.44, delay + 0.012, pan);
    } else if (event.type === 'bolt' && own) {
      this.burst(0.19, 4100, 0.065);
      this.burst(0.14, 2450, 0.08, 0.073);
    } else if (event.type === 'reload' && own) {
      for (const offset of [0.02, 0.53, 0.95, 1.68, 2.38]) this.burst(0.16, 2700 + offset * 410, 0.055, offset);
    } else if (event.type === 'hit' && (event.target === self || own)) {
      if (own) {
        this.tone(event.headshot ? 880 : 510, event.lethal ? 0.17 : 0.085, 0.13);
        this.burst(event.headshot ? 0.2 : 0.28, event.headshot ? 2200 : 780, 0.08);
      } else this.burst(0.35, 250, 0.15);
    } else if (event.type === 'impact' && horizontalDistance(position, event.position) < 8) {
      this.burst(0.15, 3850, 0.082);
    }
  }

  footstep(time: number, sprinting: boolean, crouched: boolean): void {
    if (time < this.stepAt) return;
    this.stepAt = time + (sprinting ? 0.29 : crouched ? 0.58 : 0.43);
    this.burst(crouched ? 0.065 : 0.14, 450 + Math.random() * 420, 0.12);
  }

  private tone(frequency: number, duration: number, volume: number): void {
    if (!this.context || !this.master) return;
    const ctx = this.context, now = ctx.currentTime;
    const source = ctx.createOscillator();
    const gain = ctx.createGain();
    source.type = 'triangle';
    source.frequency.setValueAtTime(frequency, now);
    source.frequency.exponentialRampToValueAtTime(frequency * 0.68, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + duration);
  }

  private burst(volume: number, cutoff: number, duration: number, delay = 0, pan = 0): void {
    if (!this.context || !this.master || !this.noise || volume <= 0.002) return;
    const ctx = this.context;
    const time = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    const stereo = ctx.createStereoPanner();
    stereo.pan.value = pan;
    source.connect(lowpass).connect(gain).connect(stereo).connect(this.master);
    source.start(time, Math.random() * 2, duration);
  }
}
