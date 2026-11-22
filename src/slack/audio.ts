import type { CreateAudio, SfxName, StageId } from './types';

export const createSlackAudio: CreateAudio = () => {
  let ctx: AudioContext | null = null, master: GainNode | null = null, filter: BiquadFilterNode | null = null;
  let muted = false, muffled = false, background: AudioNode[] = [];
  const ensure = (): AudioContext | null => {
    if (ctx) return ctx;
    try { ctx = new AudioContext(); master = ctx.createGain(); filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = muffled ? 650 : 18000; filter.connect(master); master.connect(ctx.destination); master.gain.value = muted ? 0 : 0.55; return ctx; } catch { return null; }
  };
  const tone = (freq: number, duration: number, volume: number, type: OscillatorType = 'sine', end = freq, delay = 0): void => {
    const c = ensure(); if (!c || !filter) return; const t = c.currentTime + delay, osc = c.createOscillator(), gain = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain); gain.connect(filter); osc.start(t); osc.stop(t + duration + 0.01);
  };
  const noise = (duration: number, volume: number, frequency: number, delay = 0): void => {
    const c = ensure(); if (!c || !filter) return; const size = Math.max(1, Math.floor(c.sampleRate * duration)), buffer = c.createBuffer(1, size, c.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource(), band = c.createBiquadFilter(), gain = c.createGain(), t = c.currentTime + delay;
    source.buffer = buffer; band.type = 'bandpass'; band.frequency.value = frequency; band.Q.value = 0.7; gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(band); band.connect(gain); gain.connect(filter); source.start(t); source.stop(t + duration);
  };
  const stopBackground = (): void => { for (const node of background) { if (node instanceof OscillatorNode || node instanceof AudioBufferSourceNode) { try { node.stop(); } catch { /* already stopped */ } } node.disconnect(); } background = []; };
  const ambience = (next: StageId | null): void => {
    stopBackground(); if (!next) return; const c = ensure(); if (!c || !filter) return;
    const osc = c.createOscillator(), gain = c.createGain(); osc.frequency.value = next === 'class' ? 60 : 95; osc.type = 'sine'; gain.gain.value = next === 'class' ? 0.014 : 0.009; osc.connect(gain); gain.connect(filter); osc.start(); background.push(osc, gain);
    const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), low = c.createBiquadFilter(), ng = c.createGain(); src.buffer = buffer; src.loop = true; low.type = 'lowpass'; low.frequency.value = next === 'class' ? 300 : 700; ng.gain.value = next === 'class' ? 0.012 : 0.018; src.connect(low); low.connect(ng); ng.connect(filter); src.start(); background.push(src, low, ng);
  };
  const play = (name: SfxName, vol = 1): void => {
    const v = Math.max(0, Math.min(1, vol));
    switch (name) {
      case 'footstep': tone(100 + v * 65, .13, .13 * v, 'triangle', 48); noise(.07, .09 * v, 300 + v * 1600); break;
      case 'doorOpen': tone(220, .5, .045 * v, 'sawtooth', 120); noise(.25, .035 * v, 600); break;
      case 'doorClose': tone(100, .25, .17 * v, 'triangle', 48); noise(.1, .1 * v, 600); break;
      case 'lock': tone(900, .05, .07 * v, 'square', 600); break;
      case 'peek': tone(520, .18, .04 * v, 'sine', 680); break;
      case 'chair': noise(.35, .09 * v, 900); tone(170, .3, .025 * v, 'sawtooth', 110); break;
      case 'pencil': for (let i = 0; i < 3; i++) noise(.09, .035 * v, 2600, i * .11); break;
      case 'page': noise(.38, .09 * v, 1800); break;
      case 'phoneBuzz': tone(110, .22, .065 * v, 'sawtooth', 100); break;
      case 'wrapper': for (let i = 0; i < 4; i++) noise(.09, .07 * v, 4000, i * .07); break;
      case 'chew': noise(.12, .05 * v, 650); noise(.1, .04 * v, 850, .18); break;
      case 'whisper': noise(.4, .035 * v, 1600); break;
      case 'nudge': tone(160, .1, .08 * v, 'triangle', 70); break;
      case 'click': case 'key': noise(.045, .07 * v, name === 'key' ? 2200 : 1400); break;
      case 'chime': tone(740, .3, .06 * v); tone(990, .4, .04 * v, 'sine', 990, .12); break;
      case 'alert': tone(440, .18, .07 * v, 'triangle', 520); break;
      case 'caught': tone(100, .8, .18 * v, 'sawtooth', 45); tone(155, .7, .08 * v, 'triangle', 80); break;
      case 'win': [523, 659, 784].forEach ( (f, i) => tone(f, .4, .06 * v, 'sine', f, i * .12)); break;
      case 'fun': tone(680, .12, .035 * v, 'sine', 820); break;
      case 'snore': noise(.6, .045 * v, 450); tone(110, .6, .035 * v, 'sine', 85); break;
      case 'hum': tone(130, .28, .07 * v, 'sine', 55); break;
    }
  };
  return { resume() { const c = ensure(); if (c?.state === 'suspended') void c.resume(); }, play, ambience, muffle(on) { muffled = on; if (filter && ctx) filter.frequency.setTargetAtTime(on ? 650 : 18000, ctx.currentTime, .08); }, setMuted(m) { muted = m; if (master && ctx) master.gain.setTargetAtTime(m ? 0 : .55, ctx.currentTime, .02); }, dispose() { stopBackground(); if (ctx) void ctx.close(); ctx = null; master = null; filter = null; } };
};
