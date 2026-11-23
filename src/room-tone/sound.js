const CHAMBERS = [
  { mains: 49.8, fan: 178, air: 780, echo: 0.18, radio: 925 },
  { mains: 56.4, fan: 119, air: 540, echo: 0.26, radio: 1170 },
  { mains: 44.7, fan: 231, air: 1350, echo: 0.33, radio: 1450 },
  { mains: 36.8, fan: 105, air: 465, echo: 0.39, radio: 825 },
];
const TONES = [220, 261.63, 293.66, 329.63, 392, 440];
const limited = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

function gain(ctx, value) {
  const node = ctx.createGain();
  node.gain.value = value;
  return node;
}

function filter(ctx, type, frequency, q = 0.7) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function ease(param, to, now, time = 0.05) {
  param.cancelScheduledValues(now);
  param.setTargetAtTime(to, now, time);
}

function envelope(param, at, peak, attack, length) {
  param.setValueAtTime(0.00001, at);
  param.exponentialRampToValueAtTime(Math.max(0.00002, peak), at + attack);
  param.exponentialRampToValueAtTime(0.00001, at + length);
}

function noiseBuffer(ctx, duration, impulse = false) {
  const count = Math.max(1, Math.round(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(impulse ? 2 : 1, count, ctx.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < count; i++) {
      const sample = Math.random() * 2 - 1;
      if (impulse) {
        // A short dark room tail with a different first reflection on each side.
        const t = i / ctx.sampleRate;
        last = last * 0.68 + sample * 0.32;
        data[i] = t < 0.019 + ch * 0.007 ? 0 : last * Math.exp(-7.1 * t);
      } else {
        data[i] = sample;
      }
    }
  }
  return buffer;
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.chapter = 0;
    this.nearness = 0;
    this.nextBeat = 0;
    this.nextDistant = 0;
    this.lastStep = -1;
    this.stepSide = 1;
    this.clock = null;
    this.waking = null;
    this.powerQueue = Promise.resolve();
  }

  async start() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio || this.muted) return;
    try {
      if (!this.ctx) {
        this.ctx = new Audio({ latencyHint: "interactive" });
        try {
          this.build();
        } catch (error) {
          // A partially built WebAudio graph cannot be reused on the next
          // gesture. Close it and permit a clean retry after a transient error.
          const failed = this.ctx;
          this.ctx = null;
          this.level = null;
          this.mix = null;
          this.radio = null;
          this.breath = null;
          try { await failed.close(); } catch { /* Audio is optional. */ }
          throw error;
        }
      }
      if (!this.paused && !this.muted && this.ctx.state === "suspended") {
        if (!this.waking)
          this.waking = this.ctx.resume().finally(() => {
            this.waking = null;
          });
        await this.waking;
      }
      this.applyLevel();
      this.syncPower();
    } catch {
      // Sound is optional on devices with a locked or unavailable audio output.
    }
  }

  build() {
    const c = this.ctx;
    this.mix = gain(c, 0.72);
    const ceiling = c.createDynamicsCompressor();
    ceiling.threshold.value = -18;
    ceiling.knee.value = 8;
    ceiling.ratio.value = 9;
    ceiling.attack.value = 0.004;
    ceiling.release.value = 0.19;
    this.level = gain(c, 0);
    this.mix.connect(ceiling).connect(this.level).connect(c.destination);

    this.noise = noiseBuffer(c, 2.4);
    const verb = c.createConvolver();
    verb.buffer = noiseBuffer(c, 1.45, true);
    this.room = gain(c, 0.18);
    this.room
      .connect(verb)
      .connect(filter(c, "lowpass", 2050))
      .connect(this.mix);

    this.hum = c.createOscillator();
    this.hum.type = "sine";
    this.hum.connect(gain(c, 0.045)).connect(this.mix);
    this.hum.start();
    this.motor = c.createOscillator();
    this.motor.type = "sine";
    this.motor.connect(gain(c, 0.015)).connect(this.mix);
    this.motor.start();

    const noise = c.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    this.air = filter(c, "lowpass", 800);
    noise
      .connect(this.air)
      .connect(filter(c, "highpass", 130))
      .connect(gain(c, 0.036))
      .connect(this.mix);
    this.radio = filter(c, "bandpass", 1000, 3.2);
    const radioLevel = gain(c, 0.01);
    noise.connect(this.radio).connect(radioLevel).connect(this.mix);
    const wobble = c.createOscillator();
    wobble.frequency.value = 0.111;
    wobble.connect(gain(c, 0.007)).connect(radioLevel.gain);
    wobble.start();
    noise.start();

    this.breath = gain(c, 0);
    const breathShape = gain(c, 0.56);
    const breathCycle = c.createOscillator();
    breathCycle.frequency.value = 0.31;
    breathCycle.connect(gain(c, 0.42)).connect(breathShape.gain);
    breathCycle.start();
    noise
      .connect(filter(c, "bandpass", 610, 1.15))
      .connect(breathShape)
      .connect(this.breath)
      .connect(this.mix);
    this.ambience(this.chapter);
    this.nextDistant = c.currentTime + 6 + Math.random() * 5;
  }

  applyLevel() {
    if (!this.level) return;
    ease(
      this.level.gain,
      this.muted || this.paused ? 0 : 0.67,
      this.ctx.currentTime,
      0.025,
    );
  }

  setMute(muted) {
    this.muted = Boolean(muted);
    this.applyLevel();
    if (this.muted) {
      if (this.clock !== null) globalThis.clearInterval(this.clock);
      this.clock = null;
    }
    this.syncPower();
  }

  pause(paused) {
    this.paused = Boolean(paused);
    this.applyLevel();
    if (this.paused) {
      if (this.clock !== null) globalThis.clearInterval(this.clock);
      this.clock = null;
      this.threat(0);
    } else if (this.ctx && this.level) {
      this.nextDistant = this.ctx.currentTime + 7 + Math.random() * 7;
    }
    this.syncPower();
  }

  // Resume and suspend are asynchronous. Queue them in order so a late
  // resume cannot restart sound after the game has paused or been muted.
  syncPower() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.powerQueue = this.powerQueue.catch(() => {}).then(async () => {
      if (ctx !== this.ctx || ctx.state === "closed") return;
      if (this.paused || this.muted) {
        if (ctx.state !== "suspended") await ctx.suspend();
      } else {
        if (ctx.state !== "running") await ctx.resume();
        if (ctx === this.ctx && !this.paused && !this.muted) this.startClock();
      }
    }).catch(() => { /* Audio output permissions can change at runtime. */ });
  }

  startClock() {
    if (this.clock !== null || !this.ready()) return;
    this.clock = globalThis.setInterval(() => this.tick(), 210);
  }

  ambience(chapterIndex) {
    this.chapter = limited(
      Math.round(Number(chapterIndex) || 0),
      0,
      CHAMBERS.length - 1,
    );
    if (!this.radio) return;
    const mood = CHAMBERS[this.chapter];
    const at = this.ctx.currentTime;
    ease(this.hum.frequency, mood.mains, at, 0.7);
    ease(this.motor.frequency, mood.fan, at, 0.9);
    ease(this.air.frequency, mood.air, at, 0.6);
    ease(this.radio.frequency, mood.radio, at, 0.85);
    ease(this.room.gain, mood.echo, at, 0.7);
  }

  threat(proximity) {
    const next = limited(Number(proximity) || 0, 0, 1);
    const changed =
      Math.abs(next - this.nearness) > 0.012 ||
      (next === 0 && this.nearness !== 0);
    if (!changed) return;
    this.nearness = next;
    if (this.breath)
      ease(this.breath.gain, next * next * 0.12, this.ctx.currentTime, 0.23);
  }

  ready() {
    return Boolean(
      this.ctx?.state === "running" && this.level && !this.paused && !this.muted
    );
  }

  // Release audio resources on a real unload; preserve bfcache sessions.
  dispose() {
    if (this.clock !== null) globalThis.clearInterval(this.clock);
    this.clock = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.level = this.mix = this.room = this.radio = null;
    this.breath = this.air = this.noise = this.hum = this.motor = null;
    this.waking = null;
    if (ctx && ctx.state !== "closed") {
      try { void ctx.close().catch(() => {}); }
      catch { /* Do not block navigation on an audio shutdown failure. */ }
    }
  }

  tick() {
    if (!this.ready()) return;
    const at = this.ctx.currentTime;
    const near = this.nearness;
    if (near > 0.12 && at >= this.nextBeat) {
      this.note(
        56 + near * 8,
        34,
        0.15,
        0.035 + near * 0.065,
        at,
        0,
        "sine",
        0.016,
      );
      this.note(
        51,
        36,
        0.105,
        0.018 + near * 0.046,
        at + 0.106,
        0,
        "sine",
        0.013,
      );
      this.nextBeat = at + 1.08 - near * 0.69;
    }
    if (at < this.nextDistant) return;
    const side = Math.random() < 0.5 ? -0.68 : 0.68;
    const freq =
      [177, 139, 228, 111][this.chapter] * (Math.random() < 0.5 ? 1 : 1.5);
    for (const [partial, amplitude, length] of [
      [1, 0.018, 1.1],
      [2.71, 0.007, 0.69],
      [4.19, 0.003, 0.38],
    ]) {
      this.note(
        freq * partial,
        freq * partial * 0.988,
        length,
        amplitude,
        at,
        side,
        "sine",
        0.032,
      );
    }
    const cue = Math.floor(Math.random() * 3);
    if (cue === 0) {
      for (let i = 0; i < 3; i++) this.note(115, 52, 0.12, 0.035, at + i * 0.24, side);
    } else if (cue === 1) {
      for (let i = 0; i < 3; i++) this.rustle(at + i * 0.45, 0.13, 0.035, 300, side, 0.8);
    } else {
      this.rustle(at, 0.8, 0.026, 1150, side, 1.8);
    }
    this.nextDistant = at + 11 + Math.random() * 17;
  }

  spatial(out, pan) {
    const c = this.ctx;
    const stem = c.createStereoPanner ? c.createStereoPanner() : gain(c, 1);
    if (stem.pan) stem.pan.value = limited(pan, -1, 1);
    out.connect(stem);
    stem.connect(this.mix);
    stem.connect(this.room);
    return stem;
  }

  note(from, to, length, volume, at, pan = 0, type = "sine", attack = 0.012) {
    if (!this.ready()) return;
    const c = this.ctx,
      osc = c.createOscillator(),
      amp = gain(c, 0);
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + length);
    envelope(amp.gain, at, volume, attack, length);
    osc.connect(amp);
    const stem = this.spatial(amp, pan);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
      stem.disconnect();
    };
    osc.start(at);
    osc.stop(at + length + 0.012);
  }

  rustle(at, length, volume, cutoff, pan, q = 1.3) {
    if (!this.ready()) return;
    const c = this.ctx,
      src = c.createBufferSource(),
      color = filter(c, "bandpass", cutoff, q),
      amp = gain(c, 0);
    src.buffer = this.noise;
    envelope(amp.gain, at, volume, Math.min(0.012, length * 0.16), length);
    src.connect(color).connect(amp);
    const stem = this.spatial(amp, pan);
    src.onended = () => {
      src.disconnect();
      color.disconnect();
      amp.disconnect();
      stem.disconnect();
    };
    src.start(at, Math.random() * 0.7);
    src.stop(at + length + 0.01);
  }

  step(running, crouched) {
    if (!this.ready()) return;
    const at = this.ctx.currentTime;
    if (at - this.lastStep < (running ? 0.23 : 0.31)) return;
    this.lastStep = at;
    this.stepSide *= -1;
    const side = this.stepSide * 0.23,
      force = crouched ? 0.28 : running ? 1.25 : 0.78;
    this.note(87 + Math.random() * 10, 42, 0.14, 0.12 * force, at, side);
    this.rustle(
      at + 0.008,
      0.115,
      0.16 * force,
      405 + Math.random() * 130,
      side,
      0.85,
    );
    this.rustle(
      at + 0.06,
      0.105,
      0.052 * force,
      1300 + Math.random() * 500,
      side,
    );
  }

  notice() {
    if (!this.ready()) return;
    const at = this.ctx.currentTime;
    this.note(48, 92, 1.15, 0.16, at, 0, "sine", 0.35);
    this.note(49, 94, 1.15, 0.06, at, 0, "triangle", 0.35);
  }

  monsterStep(distance, pan = 0) {
    if (!this.ready()) return;
    const volume = Math.pow(limited(1 - distance / 18, 0, 1), 2);
    if (volume < 0.002) return;
    const at = this.ctx.currentTime;
    const side = limited(Number(pan) || 0, -1, 1);
    this.note(68, 33, 0.2, 0.2 * volume, at, side);
    this.rustle(at, 0.16, 0.17 * volume, 220, side, 0.7);
  }

  tone(index) {
    if (!this.ready()) return;
    const n = limited(Math.round(Number(index) || 0), 0, TONES.length - 1);
    const f = TONES[n],
      at = this.ctx.currentTime;
    this.note(f, f, 0.49, 0.12, at, (n - 2.5) / 12);
    this.note(f * 2, f * 2, 0.25, 0.027, at, 0);
  }

  pickup() {
    if (!this.ready()) return;
    const at = this.ctx.currentTime;
    this.rustle(at, 0.08, 0.12, 1650, -0.1);
    this.note(397, 390, 0.13, 0.075, at + 0.045);
    this.note(588, 585, 0.3, 0.058, at + 0.15);
  }

  success() {
    if (!this.ready()) return;
    const at = this.ctx.currentTime;
    [196, 293.66, 392].forEach((f, i) =>
      this.note(f, f, 0.83, 0.078, at + i * 0.16, (i - 1) * 0.19),
    );
  }

  caught() {
    if (!this.ready()) return;
    const at = this.ctx.currentTime;
    this.rustle(at, 0.48, 0.24, 680, 0, 0.65);
    this.note(111, 32, 0.94, 0.17, at, 0, "triangle", 0.046);
    this.note(83, 39, 0.77, 0.1, at + 0.035, -0.3, "sine", 0.06);
    this.rustle(at + 0.2, 0.53, 0.09, 1480, 0.43);
  }
}
