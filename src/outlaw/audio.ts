// OUTLAW CITY 사운드: 효과음과 차량·도시 환경음 및 절차적 라디오를 합성합니다.
import { AudioEngine } from '../audio-core';
import type { VehicleKind } from './types';

const clamp = (v: number, a = 0, b = 1): number => Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : a;
const hz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);
const names = ['OFF', 'WALDO FM', 'NEON 88', 'DUST ROAD'];
const roots = [[45, 41, 48, 43], [45, 41, 48, 43], [40, 45, 47, 45]];
/** 절대 스텝에서 마디, 코드와 음을 계산합니다. */
export function radioStep(station: number, step: number): { beat: number; bar: number; root: number; note: number; bpm: number } {
  const s = clamp(Math.floor(station), 1, 3), n = Math.max(0, Math.floor(step));
  const bar = Math.floor(n / 16), era = Math.floor(bar / 96), beat = n % 16;
  const progression = roots[s - 1], root = progression[(Math.floor(bar / 2) + era) % 4] + [0, 2, -2, 3][era % 4];
  const scale = s === 3 ? [0, 3, 5, 7, 10, 12] : [0, 3, 7, 10, 12, 7, 3, 10];
  return { beat, bar, root, note: root + scale[(beat + Math.floor(bar / 4)) % scale.length], bpm: [0, 88, 112, 76][s] + [0, 4, -3, 2][era % 4] };
}

type Loop = { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
type Motor = { a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };
export class OutlawAudio {
  private eng = new AudioEngine();
  private last = new Map<string, number>();
  private motor: Motor | null = null;
  private skid: Loop | null = null; private wind: Loop | null = null; private crowd: Loop | null = null; private rainLoop: Loop | null = null;
  private cricket: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode; modulation: GainNode } | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; lfo: OscillatorNode } | null = null;
  private radioBus: GainNode | null = null; private radioTimer: ReturnType<typeof setInterval> | null = null;
  private station = 0; private radioVolume = 1; private nextTime = 0; private step = 0; private disposed = false;
  private screamIndex = 0;
  get enabled(): boolean { return this.eng.enabled; }
  set enabled(on: boolean) { this.eng.setEnabled(on); }
  unlock(): void {
    if (this.disposed) return;
    const c = this.eng.unlock(), dest = this.eng.bus;
    if (!c || !dest || this.motor) return;
    const a = c.createOscillator(), b = c.createOscillator(), filter = c.createBiquadFilter(), gain = c.createGain();
    a.type = 'sawtooth'; b.type = 'square'; filter.type = 'lowpass'; gain.gain.value = 0;
    a.connect(filter); b.connect(filter); filter.connect(gain); gain.connect(dest); a.start(); b.start(); this.eng.track(a); this.eng.track(b);
    this.motor = { a, b, filter, gain };
    const loop = (type: BiquadFilterType, f: number, q: number): Loop => {
      const src = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
      src.buffer = this.eng.noise; src.loop = true; filter.type = type; filter.frequency.value = f; filter.Q.value = q; gain.gain.value = 0;
      src.connect(filter); filter.connect(gain); gain.connect(dest); src.start(); this.eng.track(src); return { src, filter, gain };
    };
    this.skid = loop('bandpass', 1900, 3); this.wind = loop('lowpass', 700, 0.5); this.crowd = loop('lowpass', 450, 0.35); this.rainLoop = loop('highpass', 2800, 0.4);
    const osc = c.createOscillator(), cg = c.createGain(), lfo = c.createOscillator(), modulation = c.createGain();
    osc.type = 'sine'; osc.frequency.value = 4800; cg.gain.value = 0; lfo.frequency.value = 8; modulation.gain.value = 0;
    lfo.connect(modulation); modulation.connect(cg.gain); osc.connect(cg); cg.connect(dest); osc.start(); lfo.start(); this.eng.track(osc); this.eng.track(lfo); this.cricket = { osc, gain: cg, lfo, modulation };
    this.radioBus = c.createGain(); this.radioBus.gain.value = this.radioVolume * 0.18; this.radioBus.connect(dest);
    if (this.station) this.startRadio();
  }
  private target(p: AudioParam, v: number, time = 0.06): void { const c = this.eng.ctx; if (c) p.setTargetAtTime(v, c.currentTime, time); }
  setEngine(on: boolean, kind: VehicleKind, speed: number, throttle: number): void {
    const m = this.motor; if (!m) return;
    const profiles: Record<VehicleKind, number> = { sedan: 1, sports: 1.35, suv: 0.82, taxi: 0.96, truck: 0.63, van: 0.76, hatch: 1.14, police: 1.12, buggy: 1.22, tank: 0.48, gt: 1.4, muscle: 0.7, hyper: 1.6, ambulance: 0.8 };
    const v = Math.abs(Number.isFinite(speed) ? speed : 0), thr = clamp(throttle), gearWidth = kind === 'tank' ? 5 : kind === 'truck' ? 8 : 12;
    const rpm = Math.min(v / gearWidth, 4.999) % 1, base = (55 + rpm * 135 + thr * 15) * (profiles[kind] || 1);
    this.target(m.a.frequency, base); this.target(m.b.frequency, base * (kind === 'tank' ? 1.03 : 1.51));
    this.target(m.filter.frequency, 350 + rpm * 900 + thr * 1100); this.target(m.gain.gain, on ? 0.06 + thr * 0.09 + rpm * 0.025 : 0);
  }
  setSkid(level: number): void { if (this.skid) this.target(this.skid.gain.gain, clamp(level) * 0.16); }
  setWind(level: number): void { if (this.wind) { const v = clamp(level); this.target(this.wind.gain.gain, v * 0.15); this.target(this.wind.filter.frequency, 450 + v * 1800); } }
  setRain(level: number): void { if (this.rainLoop) this.target(this.rainLoop.gain.gain, clamp(level) * 0.07); }
  setAmbience(crowd: number, night: boolean): void {
    if (this.crowd) this.target(this.crowd.gain.gain, clamp(crowd) * 0.06, 0.3);
    if (this.cricket) { this.target(this.cricket.gain.gain, night ? 0.006 : 0, 0.3); this.target(this.cricket.modulation.gain, night ? 0.004 : 0, 0.3); }
  }
  setSiren(level: number, pan: number): void {
    const c = this.eng.ctx, dest = this.eng.bus, v = clamp(level); if (!c || !dest) return;
    if (!v) { if (this.siren) { const s = this.siren; this.siren = null; s.gain.gain.setTargetAtTime(0, c.currentTime, 0.04); s.osc.stop(c.currentTime + 0.2); s.lfo.stop(c.currentTime + 0.2); } return; }
    if (!this.siren) {
      const osc = c.createOscillator(), lfo = c.createOscillator(), depth = c.createGain(), gain = c.createGain(), p = c.createStereoPanner();
      osc.type = 'sawtooth'; osc.frequency.value = 770; lfo.type = 'triangle'; lfo.frequency.value = 0.35; depth.gain.value = 330; gain.gain.value = 0;
      lfo.connect(depth); depth.connect(osc.frequency); osc.connect(gain); gain.connect(p); p.connect(dest); osc.start(); lfo.start(); this.eng.track(osc); this.eng.track(lfo); this.siren = { osc, lfo, gain, pan: p };
    }
    const s = this.siren; this.target(s.gain.gain, v * 0.12); this.target(s.pan.pan, clamp(pan, -1, 1));
    this.target(s.lfo.frequency, Math.floor(c.currentTime / 8) % 2 ? 2.5 : 0.35, 0.1);
  }
  private voice(freq: number, dur: number, volume: number, type: OscillatorType, dest: AudioNode, at: number, slide = 0): void {
    const c = this.eng.ctx; if (!c || volume <= 0 || !this.eng.admit()) return;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(Math.max(20, freq), at);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), at + dur);
    g.gain.setValueAtTime(Math.max(0.0001, volume), at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dest); o.addEventListener('ended', () => { this.eng.release(); o.disconnect(); g.disconnect(); }); this.eng.track(o); o.start(at); o.stop(at + dur + 0.01);
  }
  private noise(dur: number, volume: number, freq: number, dest: AudioNode, at: number, type: BiquadFilterType = 'bandpass'): void {
    const c = this.eng.ctx; if (!c || !this.eng.noise || volume <= 0 || !this.eng.admit()) return;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.eng.noise; s.loop = true; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(volume, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); s.connect(f); f.connect(g); g.connect(dest);
    s.addEventListener('ended', () => { this.eng.release(); s.disconnect(); f.disconnect(); g.disconnect(); }); this.eng.track(s); s.start(at, Math.random()); s.stop(at + dur + 0.01);
  }
  play(name: string, dist = 0, pan = 0): void { this.effect(name, dist, pan, 1); }
  crash(power: number, dist = 0): void { this.effect('crash', dist, 0, clamp(power)); }
  private effect(name: string, dist: number, pan: number, power: number): void {
    const c = this.eng.ctx, bus = this.eng.bus; if (!c || !bus || !this.enabled || this.disposed) return;
    const d = Math.max(0, Number.isFinite(dist) ? dist : 0), attenuation = 1 / (1 + (d / 35) ** 2); if (attenuation < 0.01) return;
    const gap = name === 'smg' || name === 'rifle' ? 0.045 : name === 'step' ? 0.16 : name === 'scream' ? 0.5 : 0.08;
    const now = c.currentTime; if (now - (this.last.get(name) ?? -Infinity) < gap) return; this.last.set(name, now);
    const filter = c.createBiquadFilter(), p = c.createStereoPanner(), gain = c.createGain(); filter.type = 'lowpass'; filter.frequency.value = 400 + 16000 / (1 + d / 24); p.pan.value = clamp(pan, -1, 1); gain.gain.value = attenuation * power;
    filter.connect(p); p.connect(gain); gain.connect(bus);
    const t = (f: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 0, delay = 0): void => this.voice(f, dur, vol, type, filter, now + delay, slide);
    const n = (dur: number, vol: number, f: number, type: BiquadFilterType = 'bandpass'): void => this.noise(dur, vol, f, filter, now, type);
    switch (name) {
      case 'pistol': n(.09,.5,1900); t(220,.09,.24,'square',-140); break;
      case 'smg': n(.05,.34,2600); t(290,.05,.15,'square',-120); break;
      case 'rifle': n(.12,.5,1300); t(160,.1,.28,'sawtooth',-100); break;
      case 'shotgun': n(.25,.7,800); t(100,.2,.4,'sawtooth',-65); break;
      case 'sniper': n(.34,.6,650); t(340,.26,.3,'sawtooth',-300); n(.7,.13,280,'lowpass'); break;
      case 'rocket': n(.5,.45,400,'lowpass'); t(130,.45,.3,'sawtooth',-80); break;
      case 'explosion': n(1.4,.7,250,'lowpass'); t(90,1.1,.5,'sine',-65); break;
      case 'crash': n(.5,.55,1100); t(210,.4,.25,'square',-145); t(540,.25,.13,'triangle',-240); break;
      case 'glass': n(.35,.4,5000,'highpass'); t(2100,.24,.12,'sine',-700); break;
      case 'scream': { const f = [390, 490, 580][this.screamIndex++ % 3]; t(f,.65,.22,'sawtooth',150); t(f*2,.55,.09,'triangle',180); t(f*3,.4,.04,'sine',200); break; }
      case 'honk': t(390,.45,.22,'sawtooth'); t(490,.45,.17,'square'); break;
      case 'minigun': n(.07,.45,1200); t(160,.06,.2,'square',-90); break;
      case 'railgun': n(.3,.4,3000,'highpass'); t(900,.35,.3,'sawtooth',-800); break;
      case 'grenade': t(500,.06,.2,'square',-300); break;
      case 'bat': n(.1,.4,500,'lowpass'); t(95,.14,.25,'triangle',-50); break;
      case 'punch': case 'hit': n(.12,.35,400,'lowpass'); t(130,.12,.22,'triangle',-70); break;
      case 'bullet_wall': n(.08,.3,3300); t(1600,.06,.1,'triangle',-800); break;
      case 'hurt': n(.15,.28,500,'lowpass'); t(180,.18,.25,'triangle',-100); break;
      case 'hitmark': t(1500,.07,.16,'triangle'); break;
      case 'headshot': t(2100,.12,.2,'triangle'); n(.06,.2,4200); break;
      case 'cash': t(1400,.12,.16,'sine',400); t(2000,.18,.12,'sine',300,.08); break;
      case 'pickup': case 'weapon_pickup': t(600,.12,.18,'triangle',300); t(name === 'weapon_pickup' ? 1000 : 800,.15,.14,'triangle',100,.08); break;
      case 'reload': t(500,.05,.15,'square'); t(750,.06,.14,'square',0,.16); t(400,.07,.13,'square',0,.6); break;
      case 'empty': case 'menu_click': t(name === 'empty' ? 850 : 600,.04,.14,'square'); break;
      case 'door': n(.2,.3,450,'lowpass'); t(120,.15,.2,'triangle',-70); break;
      case 'wanted_up': t(600,.2,.22,'sawtooth',300); t(900,.25,.2,'sawtooth',100,.2); break;
      case 'wanted_down': t(700,.25,.16,'triangle',-350); break;
      case 'mission_start': case 'save': [440, 554, 659].forEach((f,i) => t(f,.18,.14,'triangle',0,i*.1)); break;
      case 'mission_pass': [523,659,784,1047].forEach((f,i) => t(f,.3,.18,'triangle',0,i*.12)); break;
      case 'mission_fail': case 'busted': [392,330,262].forEach((f,i) => t(f,.3,.16,'sawtooth',-30,i*.18)); break;
      case 'wasted': t(220,1.5,.25,'sawtooth',-170); t(110,1.8,.18,'sine',-70); break;
      case 'step': n(.07,.08,300,'lowpass'); break;
    }
    // 연결은 예약된 가장 긴 효과음이 끝난 뒤 해제합니다.
    setTimeout(() => { filter.disconnect(); p.disconnect(); gain.disconnect(); }, 2600);
  }
  setRadio(station: number): void {
    const s = Math.floor(clamp(station, 0, 3)); if (s === this.station) return; this.station = s;
    if (this.radioTimer !== null) { clearInterval(this.radioTimer); this.radioTimer = null; }
    const c = this.eng.ctx, bus = this.eng.bus;
    if (c && bus && this.radioBus) { this.radioBus.disconnect(); this.radioBus = c.createGain(); this.radioBus.gain.value = this.radioVolume * .18; this.radioBus.connect(bus); }
    this.step = 0; if (s && c) this.startRadio();
  }
  setRadioVolume(v: number): void { this.radioVolume = clamp(v); if (this.radioBus) this.target(this.radioBus.gain, this.radioVolume * .18); }
  currentStationName(): string { return names[this.station]; }
  private startRadio(): void { const c = this.eng.ctx; if (!c || this.radioTimer !== null) return; this.nextTime = c.currentTime + .05; this.radioTimer = setInterval(() => this.tickRadio(), 25); this.tickRadio(); }
  private tickRadio(): void {
    const c = this.eng.ctx, dest = this.radioBus; if (!c || !dest || !this.station || c.state !== 'running') return;
    if (this.nextTime < c.currentTime - .2) this.nextTime = c.currentTime + .03;
    while (this.nextTime < c.currentTime + .12) {
      const x = radioStep(this.station, this.step++), at = this.nextTime, sixteenth = 60 / x.bpm / 4;
      const tone = (note: number, dur: number, vol: number, type: OscillatorType = 'triangle'): void => this.voice(hz(note), dur, vol, type, dest, at);
      const drum = (dur: number, vol: number, f: number): void => this.noise(dur, vol, f, dest, at);
      if (this.station === 1) {
        if (x.beat === 0 || x.beat === 8 || (x.bar % 2 && x.beat === 11)) this.voice(110,.18,.32,'sine',dest,at,-65);
        if (x.beat === 4 || x.beat === 12) drum(.13,.22,1800);
        if (x.beat % 2 === 0) drum(.035,.07,7000);
        if (x.beat === 0 || x.beat === 7 || x.beat === 10) tone(x.root - 12,.25,.16,'sawtooth');
        if (x.beat === 0) [0,3,7].forEach(i => tone(x.root + i,.9,.035,'triangle'));
      } else if (this.station === 2) {
        if (x.beat % 4 === 0) this.voice(115,.15,.23,'sine',dest,at,-70);
        if (x.beat === 4 || x.beat === 12) drum(.16,.18,2100);
        if (x.beat % 2 === 0) { tone(x.note + 12,.13,.105,'sawtooth'); this.voice(hz(x.note + 12),.08,.025,'triangle',dest,at + sixteenth * 3); }
        if (x.beat === 0 || x.beat === 8) tone(x.root - 12,.25,.12,'square');
      } else {
        if (x.beat === 0 || x.beat === 8) tone(x.root - 12,.3,.16);
        if (x.beat === 4 || x.beat === 12) drum(.16,.10,3500);
        if (x.beat % 4 === 0 || (x.bar % 2 && x.beat === 10)) { tone(x.note,.3,.15); drum(.025,.05,4500); }
      }
      this.nextTime += sixteenth;
    }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    if (this.radioTimer !== null) clearInterval(this.radioTimer); this.radioTimer = null; this.radioBus?.disconnect();
    this.eng.dispose(); this.motor = null; this.skid = this.wind = this.crowd = this.rainLoop = null; this.siren = null; this.cricket = null; this.radioBus = null;
  }
}
