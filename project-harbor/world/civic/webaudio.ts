/**
 * Procedural Harbor audio. Every buffer and oscillator is synthesized here.
 * No recordings are loaded. The score is original and released under CC0 1.0.
 * See project-harbor/AUDIO.md.
 */
import type { MixFrame, Surface } from './audio';

const BED: Record<MixFrame['ambient'][number]['color'], { type: BiquadFilterType; freq: number; q: number }> = {
  canopy: { type: 'lowpass', freq: 900, q: 0.7 },
  traffic: { type: 'bandpass', freq: 420, q: 0.6 },
  garden: { type: 'lowpass', freq: 1400, q: 0.5 },
  wind: { type: 'lowpass', freq: 520, q: 0.4 },
  crowd: { type: 'bandpass', freq: 740, q: 0.8 },
  machine: { type: 'lowpass', freq: 280, q: 0.9 },
};

const STEP: Record<Surface, number> = {
  asphalt: 1900, concrete: 2400, grass: 620, sand: 480, dirt: 760, gravel: 1100,
};

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x1234567;
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed / 4294967296 * 2 - 1;
  }
  return buffer;
}

function env(ctx: AudioContext, gain: GainNode, peak: number, attack: number, hold: number, release: number) {
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
  gain.gain.setValueAtTime(Math.max(0.0002, peak), now + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + hold + release);
}

export function burstHorn(ctx: AudioContext, destination: AudioNode = ctx.destination) {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  env(ctx, gain, 0.08, 0.02, 0.28, 0.12);
  for (const frequency of [370, 440]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    osc.connect(filter);
    osc.start(now);
    osc.stop(now + 0.46);
  }
  filter.connect(gain).connect(destination);
}

export class HarborAudio {
  private readonly master: GainNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly noise: AudioBuffer;
  private readonly bedA: { filter: BiquadFilterNode; gain: GainNode };
  private readonly bedB: { filter: BiquadFilterNode; gain: GainNode };
  private readonly siren: { osc: OscillatorNode; gain: GainNode };
  private readonly engines: { osc: OscillatorNode; noise: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode }[];
  private sirenPhase = 0;
  private chirp = 0;
  private active = 0;

  constructor(private readonly ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;
    this.master.connect(this.comp).connect(ctx.destination);
    this.noise = noiseBuffer(ctx);
    this.bedA = this.bed();
    this.bedB = this.bed();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(this.master);
    osc.start();
    this.siren = { osc, gain };
    this.engines = [0, 1].map(() => this.engine());
  }

  private bed() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    return { filter, gain };
  }

  private engine() {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    noise.connect(filter);
    filter.connect(gain).connect(this.master);
    osc.start();
    noise.start();
    return { osc, noise, filter, gain };
  }

  private tone(frequency: number, type: OscillatorType, peak: number, seconds: number, pan: number) {
    if (this.active > 24) return;
    this.active += 1;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.value = frequency;
    panner.pan.value = pan;
    env(this.ctx, gain, peak, 0.01, seconds * 0.35, seconds * 0.6);
    osc.connect(gain).connect(panner).connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + seconds + 0.02);
    osc.onended = () => { this.active = Math.max(0, this.active - 1); };
  }

  private burst(freq: number, peak: number, seconds: number, pan: number, cutoff: number) {
    if (this.active > 24) return;
    this.active += 1;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = Math.max(180, Math.min(freq, cutoff));
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    env(this.ctx, gain, peak, 0.005, 0.02, seconds);
    src.connect(filter).connect(gain).connect(panner).connect(this.master);
    src.start();
    src.stop(this.ctx.currentTime + seconds + 0.05);
    src.onended = () => { this.active = Math.max(0, this.active - 1); };
  }

  apply(frame: MixFrame, dt: number) {
    const beds = [this.bedA, this.bedB];
    frame.ambient.slice(0, 2).forEach((layer, index) => {
      const bed = beds[index];
      if (!bed) return;
      const spec = BED[layer.color];
      bed.filter.type = spec.type;
      bed.filter.frequency.value = spec.freq;
      bed.filter.Q.value = spec.q;
      bed.gain.gain.value = layer.gain * (frame.hours < 6 || frame.hours > 21 ? 0.55 : 1);
    });
    if (frame.ambient.length < 2) this.bedB.gain.gain.value = 0;
    this.chirp += dt;
    const birds = (frame.district === 'forest' || frame.district === 'rich') && frame.hours > 5 && frame.hours < 19;
    if (birds && this.chirp > 1.6) {
      this.chirp = 0;
      this.tone(1400 + (frame.hours % 5) * 180, 'sine', (frame.ambient[0]?.gain ?? 0) * 0.35, 0.12, 0.2);
    }
    this.sirenPhase += dt * (frame.siren.yelp ? 9 : 2.4);
    const wave = (Math.sin(this.sirenPhase) + 1) / 2;
    this.siren.osc.frequency.value = 640 + wave * (frame.siren.yelp ? 760 : 480);
    this.siren.gain.gain.value = frame.siren.gain;
    this.engines.forEach((engine, index) => {
      const source = frame.engines[index];
      engine.gain.gain.value = source?.gain ?? 0;
      if (!source) return;
      engine.osc.frequency.value = 48 + source.pitch * 70;
      engine.filter.frequency.value = 180 + source.pitch * 220;
    });
    for (const voice of frame.voices) this.play(voice.kind, voice.gain, voice.pan, voice.pitch, voice.cutoff, voice.surface);
  }

  private play(kind: MixFrame['voices'][number]['kind'], gain: number, pan: number, pitch: number, cutoff: number, surface?: Surface) {
    if (kind === 'gun') {
      this.burst(cutoff, gain * 0.9, 0.09, pan, cutoff);
      this.tone(90 * pitch, 'sine', gain * 0.45, 0.08, pan);
      return;
    }
    if (kind === 'impact') {
      this.burst(240, gain * 0.8, 0.14, pan, cutoff);
      this.tone(70, 'triangle', gain * 0.4, 0.12, pan);
      return;
    }
    if (kind === 'horn') {
      this.tone(370 * pitch, 'triangle', gain * 0.35, 0.28, pan);
      this.tone(440 * pitch, 'triangle', gain * 0.28, 0.28, pan);
      return;
    }
    if (kind === 'scream') {
      this.tone(720 * pitch, 'sawtooth', gain * 0.22, 0.32, pan);
      return;
    }
    if (kind === 'shout') {
      this.tone(240 * pitch, 'square', gain * 0.18, 0.18, pan);
      return;
    }
    if (kind === 'phone') {
      this.tone(880, 'sine', gain * 0.2, 0.08, pan);
      this.tone(660, 'sine', gain * 0.16, 0.1, pan);
      return;
    }
    if (kind === 'step') {
      this.burst(STEP[surface ?? 'asphalt'] * pitch, gain * 0.45, 0.05, pan, cutoff);
      return;
    }
    if (kind === 'cash') {
      this.tone(880, 'sine', gain * 0.16, 0.06, 0);
      this.tone(1320, 'sine', gain * 0.12, 0.08, 0);
      return;
    }
    this.tone(660 * pitch, 'sine', gain * 0.14, 0.04, 0);
  }

  suspend() {
    if (this.ctx.state === 'running') return this.ctx.suspend();
    return Promise.resolve();
  }

  resume() {
    if (this.ctx.state === 'suspended') return this.ctx.resume();
    return Promise.resolve();
  }

  async dispose() {
    try { await this.ctx.close(); } catch { /* already closed */ }
  }
}
