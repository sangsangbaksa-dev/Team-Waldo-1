// Shared Web Audio graph for LAST CITY and SPEED RUSH.
// Oscillator / noise synthesis only — no audio files. Master sits at ~0.15 behind a compressor limiter.

export const MASTER_GAIN = 0.15;
export const VOICE_CAP = 20;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function audioCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  bus: GainNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  noise: AudioBuffer | null = null;
  enabled = true;
  voices = 0;
  private wanted = false;
  private disposed = false;
  private unsub: Array<() => void> = [];
  private live = new Set<AudioScheduledSourceNode>();

  constructor() {
    this.watch();
  }

  private watch(): void {
    if (typeof document === 'undefined') return;
    const gesture = (): void => { this.unlock(); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
      document.addEventListener(ev, gesture, { capture: true });
      this.unsub.push(() => document.removeEventListener(ev, gesture, { capture: true }));
    }
    const vis = (): void => {
      if (!this.ctx) return;
      if (document.hidden && this.ctx.state === 'running') this.setContextRunning(false);
      else if (!document.hidden && this.wanted && this.ctx.state !== 'running') this.setContextRunning(true);
    };
    document.addEventListener('visibilitychange', vis);
    this.unsub.push(() => document.removeEventListener('visibilitychange', vis));
  }

  private setContextRunning(running: boolean): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    // Some browsers reject resume/suspend during a tab or device transition.
    void (running ? ctx.resume() : ctx.suspend()).catch(() => undefined);
  }

  unlock(): AudioContext | null {
    if (this.disposed) return null;
    this.wanted = true;
    if (this.ctx) {
      if (this.ctx.state !== 'running' && (typeof document === 'undefined' || !document.hidden)) this.setContextRunning(true);
      return this.ctx;
    }
    const AC = audioCtor();
    if (!AC) return null;
    let pending: AudioContext | null = null;
    try {
      const ctx = pending = new AC();
      const bus = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 2;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.12;
      const master = ctx.createGain();
      master.gain.value = this.enabled ? MASTER_GAIN : 0;
      bus.connect(compressor);
      compressor.connect(master);
      master.connect(ctx.destination);
      const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.bus = bus;
      this.compressor = compressor;
      this.master = master;
      this.noise = noise;
      if (typeof document !== 'undefined' && document.hidden) this.setContextRunning(false);
      else if (ctx.state !== 'running') this.setContextRunning(true);
      return ctx;
    } catch {
      if (pending && pending.state !== 'closed') void pending.close().catch(() => undefined);
      this.ctx = null;
      this.master = this.bus = null;
      this.compressor = null; this.noise = null;
      return null;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!this.master || !this.ctx) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(on ? MASTER_GAIN : 0, this.ctx.currentTime, 0.03);
  }

  admit(): boolean {
    if (this.voices >= VOICE_CAP) return false;
    this.voices += 1;
    return true;
  }

  release(): void {
    this.voices = Math.max(0, this.voices - 1);
  }

  track(node: AudioScheduledSourceNode): void {
    this.live.add(node);
    const done = (): void => { this.live.delete(node); };
    node.addEventListener('ended', done);
  }

  stopLive(): void {
    for (const node of this.live) {
      try { node.stop(); } catch { /* already stopped */ }
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    this.live.clear();
    this.voices = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLive();
    for (const off of this.unsub) off();
    this.unsub = [];
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.bus = null;
    this.compressor = null;
    this.noise = null;
    this.wanted = false;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }
}

export function tone(eng: AudioEngine, freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 0, delay = 0): void {
  const c = eng.ctx, dest = eng.bus;
  if (!c || !dest || !eng.enabled || vol < 0.01 || dur <= 0 || delay < 0 || ![freq, dur, vol, slide, delay].every(Number.isFinite) || !eng.admit()) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(Math.max(0.0001, vol), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest);
  const done = (): void => { eng.release(); try { o.disconnect(); g.disconnect(); } catch { /* closed */ } };
  o.addEventListener('ended', done);
  eng.track(o);
  o.start(t);
  o.stop(t + dur + 0.03);
}

export function burst(eng: AudioEngine, dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass'): void {
  const c = eng.ctx, dest = eng.bus;
  if (!c || !dest || !eng.noise || !eng.enabled || vol < 0.01 || dur <= 0 || ![dur, vol, freq, q].every(Number.isFinite) || !eng.admit()) return;
  const t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = eng.noise; s.loop = true;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(Math.max(0.0001, vol), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  const done = (): void => { eng.release(); try { s.disconnect(); f.disconnect(); g.disconnect(); } catch { /* closed */ } };
  s.addEventListener('ended', done);
  eng.track(s);
  s.start(t, Math.random());
  s.stop(t + dur + 0.03);
}
