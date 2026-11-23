import type { CreateAudio, SfxName, StageId } from './types';

// 믹스 구조: 효과음·앰비언스 → filter(먹먹) → damp(이어폰 감쇠) → comp(겹침 압축) → master → 출력. direct 는 이어폰 음악용(먹먹 무관).
const MASTER = 0.55, OPEN = 18000, MUFFLED = 520, DAMP = 0.5;
const PENTA = [392, 440, 523, 587, 659, 784];

export const createSlackAudio: CreateAudio = () => {
  let ctx: AudioContext | null = null, master: GainNode | null = null, filter: BiquadFilterNode | null = null, damp: GainNode | null = null, comp: DynamicsCompressorNode | null = null, direct: GainNode | null = null;
  let muted = false, muffled = false, disposed = false, resuming = false, held = false;
  let pendingSuspend: Promise<void> | null = null;
  let background: AudioNode[] = [], ambTimer = 0, bedTimer = 0, step = 0;
  let requestedAmbience: StageId | null = null;
  let sfxNoise: AudioBuffer | null = null;
  let lastUiSoundAt = -Infinity;
  const ensure = (): AudioContext | null => {
    if (disposed) return null;
    if (ctx) return ctx;
    try {
      ctx = new AudioContext(); master = ctx.createGain(); filter = ctx.createBiquadFilter(); damp = ctx.createGain(); comp = ctx.createDynamicsCompressor(); direct = ctx.createGain();
      filter.type = 'lowpass'; filter.frequency.value = muffled ? MUFFLED : OPEN; damp.gain.value = muffled ? DAMP : 1;
      comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      filter.connect(damp); damp.connect(comp); direct.connect(comp); comp.connect(master); master.connect(ctx.destination); master.gain.value = muted ? 0 : MASTER;
      return ctx;
    } catch { return null; }
  };
  /** cut: 이 소리만 거는 로우패스(멀리서 들리는 소리). dest: 먹먹 필터를 우회할 때 direct. */
  const tone = (freq: number, duration: number, volume: number, type: OscillatorType = 'sine', end = freq, delay = 0, cut = 0, dest?: AudioNode): void => {
    const c = ctx; const out = dest ?? filter; if (muted || c?.state !== 'running' || !out) return; const t = c.currentTime + delay, osc = c.createOscillator(), gain = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, t + segment);
    osc.connect(gain);
    const lp = cut ? c.createBiquadFilter() : null;
    if (lp) { lp.type = 'lowpass'; lp.frequency.value = cut; gain.connect(lp); lp.connect(out); } else gain.connect(out);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); lp?.disconnect(); };
    osc.start(t); osc.stop(t + duration + 0.01);
  };
  const noise = (duration: number, volume: number, frequency: number, delay = 0, cut = 0): void => {
    const c = ctx; if (muted || c?.state !== 'running' || !filter) return;
    // Reuse one second of white noise across short SFX instead of allocating a
    // fresh AudioBuffer on every footstep, click, typing burst or ambience cue.
    // Shift the playback offset so repeated effects do not sound identical.
    if (!sfxNoise) {
      const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate)), c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      sfxNoise = buffer;
    }
    const segment = Math.max(0.001, Math.min(duration, sfxNoise.duration || 1));
    const offset = Math.random() * Math.max(0, (sfxNoise.duration || 1) - segment);
    const source = c.createBufferSource(), band = c.createBiquadFilter(), gain = c.createGain(), t = c.currentTime + delay;
    source.buffer = sfxNoise; band.type = 'bandpass'; band.frequency.value = frequency; band.Q.value = 0.7; gain.gain.setValueAtTime(Math.max(0.0002, volume), t); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(band); band.connect(gain);
    const lp = cut ? c.createBiquadFilter() : null;
    if (lp) { lp.type = 'lowpass'; lp.frequency.value = cut; gain.connect(lp); lp.connect(filter); } else gain.connect(filter);
    source.onended = () => { source.disconnect(); band.disconnect(); gain.disconnect(); lp?.disconnect(); };
    source.start(t, offset, segment); source.stop(t + segment);
  };
  const stopBackground = (): void => {
    clearTimeout(ambTimer); ambTimer = 0;
    for (const node of background) { if ('stop' in node) (node as AudioScheduledSourceNode).stop(); node.disconnect(); }
    background = [];
  };
  const loopNoise = (c: AudioContext): AudioBufferSourceNode => {
    const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buffer; src.loop = true; return src;
  };
  /** 느린 떨림(형광등·복도 소리의 일렁임)을 target 에 얹는다. */
  const lfo = (c: AudioContext, rate: number, depth: number, target: AudioParam): void => {
    const o = c.createOscillator(), g = c.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target); o.start(); background.push(o, g);
  };
  const ambience = (next: StageId | null): void => {
    requestedAmbience = next;
    stopBackground(); if (!next || muted || disposed) return;
    const c = ctx; if (!c || !filter) return; const cls = next === 'class';
    // 층 1: 전원 험(형광등 웅웅 / PC 팬 저음). 층 2: 방 공기 노이즈. 층 3: 멀리 복도·환풍기 일렁임. 합쳐서 0.03 안팎으로 효과음 아래에 깔리게 한다.
    const hum = c.createOscillator(), hg = c.createGain(); hum.type = 'sine'; hum.frequency.value = cls ? 60 : 95; hg.gain.value = cls ? 0.011 : 0.008; hum.connect(hg); hg.connect(filter); hum.start(); background.push(hum, hg);
    if (cls) { const h2 = c.createOscillator(), g2 = c.createGain(); h2.type = 'sine'; h2.frequency.value = 120; g2.gain.value = 0.004; h2.connect(g2); g2.connect(filter); h2.start(); background.push(h2, g2); lfo(c, 0.31, 0.003, g2.gain); }
    const air = loopNoise(c), low = c.createBiquadFilter(), ag = c.createGain(); low.type = 'lowpass'; low.frequency.value = cls ? 260 : 800; ag.gain.value = cls ? 0.011 : 0.016; air.connect(low); low.connect(ag); ag.connect(filter); air.start(); background.push(air, low, ag);
    const far = loopNoise(c), band = c.createBiquadFilter(), fg = c.createGain(); band.type = 'bandpass'; band.frequency.value = cls ? 520 : 240; band.Q.value = 0.9; fg.gain.value = cls ? 0.005 : 0.004; far.connect(band); band.connect(fg); fg.connect(filter); far.start(); background.push(far, band, fg); lfo(c, cls ? 0.06 : 0.11, cls ? 0.004 : 0.003, fg.gain);
    // 생활 소음: 아주 작게 가끔(주의를 끌지 않을 정도). 발소리와 헷갈리지 않게 걸음 종류는 쓰지 않는다.
    const life = (): void => {
      if (cls) { const pick = Math.random(); if (pick < 0.5) for (let i = 0; i < 3; i++) noise(0.09, 0.012, 2600, i * 0.11); else if (pick < 0.8) noise(0.3, 0.014, 1800); else { noise(0.25, 0.012, 900); tone(170, 0.25, 0.005, 'sawtooth', 110); } }
      else for (let i = 0, n = 2 + Math.floor(Math.random() * 5); i < n; i++) noise(0.04, 0.012, 2200, i * (0.09 + Math.random() * 0.12));
      ambTimer = window.setTimeout(life, 4000 + Math.random() * 6000);
    };
    ambTimer = window.setTimeout(life, 3000 + Math.random() * 3000);
  };
  const setMuffle = (on: boolean): void => {
    muffled = on; clearTimeout(bedTimer); bedTimer = 0;
    if (ctx && filter && damp) { filter.frequency.setTargetAtTime(on ? MUFFLED : OPEN, ctx.currentTime, 0.1); damp.gain.setTargetAtTime(on ? DAMP : 1, ctx.currentTime, 0.1); }
    if (!on || held || muted || disposed) return;
    // 이어폰에서 새어 나오는 아주 작은 음악(먹먹 필터를 우회).
    const bed = (): void => { if (held || muted || disposed || !muffled) { bedTimer = 0; return; } if (Math.random() < 0.7) tone(PENTA[Math.floor(Math.random() * PENTA.length)], 0.55, 0.012, 'sine', undefined, 0, 0, direct ?? undefined); bedTimer = window.setTimeout(bed, 360); };
    if (ctx && !muted) bed();
  };
  const play = (name: SfxName, vol = 1): void => {
    if (muted || held || disposed || ctx?.state !== 'running') return;
    // Clicking a chip 100 times in a second should not allocate 100
    // short-lived noise buffers and oscillators. Keep important alert sounds.
    if (name === 'click' || name === 'key') {
      const now = performance.now();
      if (now - lastUiSoundAt < 40) return;
      lastUiSoundAt = now;
    }
    const v = Math.max(0, Math.min(1, vol));
    switch (name) {
      case 'footstep': {
        // 멀면 작고 둔탁(로우패스), 가까우면 크고 선명 + 구두 뒤꿈치 딱딱. 왼발/오른발 음높이를 번갈아 접근감을 낸다.
        const d = v * v, f = (118 - v * 38) * (step++ % 2 ? 1.08 : 1);
        tone(f, 0.12 + v * 0.1, 0.012 + 0.17 * d, 'triangle', 44, 0, 220 + v * 1700);
        noise(0.05 + v * 0.05, 0.01 + 0.1 * d, 260 + v * 1500, 0, 500 + v * 3500);
        if (v > 0.55) noise(0.025, 0.07 * d, 2800, 0.005);
        if (v > 0.8) tone(880, 0.07, 0.01, 'sine', 640, 0.05);
        break;
      }
      case 'doorOpen': tone(220, .5, .04 * v, 'sawtooth', 120, 0, 1400); noise(.25, .03 * v, 600); break;
      case 'doorClose': tone(100, .25, .15 * v, 'triangle', 48); noise(.1, .09 * v, 600); break;
      case 'lock': tone(900, .05, .06 * v, 'square', 600, 0, 3000); break;
      case 'peek': tone(520, .18, .035 * v, 'sine', 680); break;
      case 'chair': noise(.35, .08 * v, 900); tone(170, .3, .022 * v, 'sawtooth', 110, 0, 900); break;
      case 'pencil': for (let i = 0; i < 3; i++) noise(.09, .03 * v, 2600, i * .11); break;
      case 'page': noise(.38, .08 * v, 1800); break;
      case 'phoneBuzz': tone(110, .22, .055 * v, 'sawtooth', 100, 0, 900); break;
      case 'wrapper': for (let i = 0; i < 4; i++) noise(.09, .06 * v, 4000, i * .07); break;
      case 'chew': noise(.12, .045 * v, 650); noise(.1, .035 * v, 850, .18); break;
      case 'whisper': noise(.4, .03 * v, 1600); break;
      case 'nudge': tone(160, .1, .07 * v, 'triangle', 70, 0, 700); break;
      case 'click': case 'key': noise(.045, .06 * v, name === 'key' ? 2200 : 1400); break;
      case 'chime': tone(740, .3, .05 * v); tone(990, .4, .035 * v, 'sine', 990, .12); break;
      case 'alert': tone(440, .18, .06 * v, 'triangle', 520, 0, 2000); break;
      case 'caught': tone(100, .8, .15 * v, 'sawtooth', 45, 0, 800); tone(155, .7, .07 * v, 'triangle', 80); break;
      case 'win': [523, 659, 784].forEach((f, i) => tone(f, .4, .05 * v, 'sine', f, i * .12)); break;
      case 'fun': tone(680, .12, .03 * v, 'sine', 820); break;
      case 'snore': noise(.6, .04 * v, 450); tone(110, .6, .03 * v, 'sine', 85); break;
      // 심장 박동(쿵-쿵). game.ts 가 긴장도에 따라 vol·간격을 조절한다.
      case 'hum': tone(62, 0.16, 0.22 * v, 'sine', 38, 0, 240); tone(54, 0.2, 0.15 * v, 'sine', 34, 0.19, 240); break;
    }
  };
  const resumeAudio = (): void => {
    const c = ensure();
    if (!c || held || resuming || c.state === 'running' || c.state === 'closed') return;
    resuming = true;
    void c.resume().catch(() => {}).finally(() => {
      resuming = false;
      // A delayed resume may resolve after the player paused. The audio context
      // must not be left running under a held game just because it was still
      // 'suspended' when hold(true) was originally called.
      if (held && !disposed && c.state === 'running' && !pendingSuspend) {
        pendingSuspend = c.suspend().catch(() => {});
      }
    });
  };
  return {
    resume: resumeAudio,
    hold(on) {
      if (held === on) return;
      held = on;
      if (on) { clearTimeout(bedTimer); bedTimer = 0; }
      else if (muffled && !muted) setMuffle(true);
      if (on && ctx?.state === 'running') {
        // A quick pause/resume can race a pending suspend; resume *after*
        // suspension settles so sound is not left disabled.
        pendingSuspend = ctx.suspend().catch(() => {});
      } else if (!on && pendingSuspend) {
        const current = pendingSuspend;
        void current.then(() => {
          if (pendingSuspend !== current) return;
          pendingSuspend = null;
          if (!held && !disposed) resumeAudio();
        });
      }
    },
    play, ambience, muffle: setMuffle,
    setMuted(m) {
      if (muted === m) return;
      muted = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, .02);
      // Keep the selected stage but stop expensive noise buffers, oscillators,
      // and the ambient timer while the user cannot hear anything.
      if (m) stopBackground();
      else if (requestedAmbience) ambience(requestedAmbience);
      if (muffled) setMuffle(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopBackground(); clearTimeout(bedTimer); bedTimer = 0;
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
      ctx = null; master = null; filter = null; damp = null; comp = null; direct = null; sfxNoise = null;
    },
  };
};
