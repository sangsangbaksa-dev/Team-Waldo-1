const tone = (context, output, time, frequency, end, duration, type, volume, delay = 0) => {
  const start = time + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(duration / 5, 0.014));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration);
};

export class ArenaAudio {
  configure(settings) {
    this.settings = settings;
    if (this.output) this.output.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.035);
  }

  get volume() {
    return this.settings?.muted ? 0 : (this.settings?.volume ?? 0.55) ** 1.4 * 0.7;
  }

  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return;
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      this.context = new Audio();
      this.output = this.context.createGain();
      this.output.gain.value = this.volume;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 14;
      limiter.ratio.value = 4;
      limiter.attack.value = 0.006;
      limiter.release.value = 0.12;
      this.output.connect(limiter).connect(this.context.destination);
      this.noise = this.context.createBuffer(1, this.context.sampleRate * 0.6, this.context.sampleRate);
      const samples = this.noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      this.context.resume().catch(() => {});
    } catch { /* The game can run without audio. */ }
  }

  hiss(time, duration, high, low, volume, position = 0) {
    const context = this.context;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noise;
    filter.type = 'bandpass';
    filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(high, time);
    filter.frequency.exponentialRampToValueAtTime(low, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + duration / 6);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain);
    if (context.createStereoPanner) {
      const pan = context.createStereoPanner();
      pan.pan.value = position;
      gain.connect(pan).connect(this.output);
    } else gain.connect(this.output);
    source.start(time, Math.random() * 0.18, duration);
  }

  play(event, detail = {}, own = true) {
    if (this.context?.state !== 'running' || this.volume === 0) return;
    const c = this.context, o = this.output, t = c.currentTime;
    const thump = (pitch, end, duration, strength, delay = 0) => tone(c, o, t, pitch, end, duration, 'sine', strength, delay);
    const ring = (pitch, duration, strength, delay = 0) => tone(c, o, t, pitch, pitch * 0.98, duration, 'triangle', strength, delay);
    const pan = own ? -0.16 : 0.16;
    switch (event) {
      case 'swing': {
        const heavy = detail.attack === 'heavy';
        const riposte = detail.attack === 'riposte';
        this.hiss(t, heavy ? 0.36 : 0.18, heavy ? 800 : 1200, 410, 0.14, pan);
        this.hiss(t + (heavy ? 0.48 : riposte ? 0.11 : 0.23), 0.15, 2800, 660, heavy ? 0.32 : 0.23, pan);
        break;
      }
      case 'hit':
      case 'riposte':
        thump(event === 'riposte' ? 127 : 100, 42, 0.22, 0.5);
        this.hiss(t, 0.13, 1900, 310, 0.46, pan);
        if (event === 'riposte') ring(720, 0.25, 0.16);
        break;
      case 'parry':
      case 'clash':
      case 'block':
        this.hiss(t, 0.13, 4800, 1500, 0.35, pan);
        ring(event === 'parry' ? 1040 : 580, 0.38, 0.33);
        ring(event === 'parry' ? 1580 : 920, 0.24, 0.18);
        break;
      case 'break':
        thump(140, 42, 0.34, 0.5);
        this.hiss(t, 0.25, 3100, 400, 0.42);
        ring(355, 0.28, 0.20, 0.03);
        break;
      case 'feint':
        this.hiss(t, 0.15, 1500, 540, 0.20, pan);
        thump(85, 51, 0.10, 0.15);
        break;
      case 'dodge':
      case 'evade':
        this.hiss(t, 0.19, 1200, 300, 0.29, pan);
        thump(83, 43, 0.12, 0.25);
        break;
      case 'fight':
      case 'round':
        thump(event === 'fight' ? 116 : 98, 43, 0.48, 0.48);
        ring(330, 0.46, 0.25);
        ring(event === 'fight' || own ? 495 : 278, 0.5, 0.21, 0.1);
        break;
      case 'overtime':
        ring(440, 0.38, 0.23);
        ring(385, 0.38, 0.26, 0.14);
        break;
      case 'step':
        this.hiss(t, 0.10, 520, 185, 0.075, pan);
        thump(76, 43, 0.1, 0.10);
        break;
      case 'menu':
        ring(445, 0.11, 0.095);
        break;
    }
  }
}
