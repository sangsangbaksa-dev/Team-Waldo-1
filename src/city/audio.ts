// LAST CITY — Web Audio 합성 효과음 (외부 음원 없음)
type Ctx = AudioContext;
export class CityAudio {
  ctx: Ctx | null = null; master: GainNode | null = null; enabled = true; last = new Map<string, number>(); noise: AudioBuffer | null = null;
  engine: { osc: OscillatorNode; gain: GainNode } | null = null; music: number | null = null; step = 0;
  unlock(): void {
    if (this.ctx || !this.enabled) { void this.ctx?.resume(); return; }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.music = window.setInterval(() => this.tick(), 210);
    } catch { this.ctx = null; }
  }
  setEnabled(on: boolean): void { this.enabled = on; if (this.master) this.master.gain.value = on ? 0.5 : 0; }
  dispose(): void { if (this.music !== null) clearInterval(this.music); this.engine?.osc.stop(); void this.ctx?.close(); this.ctx = null; }
  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = 0, delay = 0): void {
    const c = this.ctx; if (!c || !this.master) return; const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  private burst(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass'): void {
    const c = this.ctx; if (!c || !this.master || !this.noise) return; const t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  /** vol: 거리 감쇠가 적용된 0..1 */
  play(name: string, vol = 1): void {
    if (!this.ctx || !this.enabled || vol < 0.03) return; const now = performance.now(), gap = name === 'smg' || name === 'rifle' ? 45 : 60; if (now - (this.last.get(name) ?? 0) < gap) return; this.last.set(name, now);
    switch (name) {
      case 'pistol': this.burst(0.09, 0.5 * vol, 1800, 0.8); this.tone(220, 0.07, 0.25 * vol, 'square', -120); break;
      case 'smg': this.burst(0.06, 0.4 * vol, 2400, 0.9); this.tone(180, 0.05, 0.18 * vol, 'square', -80); break;
      case 'rifle': this.burst(0.1, 0.5 * vol, 1400, 0.7); this.tone(150, 0.08, 0.3 * vol, 'sawtooth', -90); break;
      case 'shotgun': this.burst(0.22, 0.75 * vol, 900, 0.5); this.tone(110, 0.16, 0.4 * vol, 'sawtooth', -70); break;
      case 'sniper': this.burst(0.3, 0.7 * vol, 700, 0.4); this.tone(300, 0.25, 0.35 * vol, 'sawtooth', -250); break;
      case 'rocket': this.burst(0.4, 0.45 * vol, 500, 0.6, 'lowpass'); this.tone(140, 0.4, 0.25 * vol, 'sawtooth', 200); break;
      case 'cannon': this.burst(0.35, 0.9 * vol, 300, 0.5, 'lowpass'); this.tone(80, 0.3, 0.6 * vol, 'sine', -50); break;
      case 'rail': this.tone(1800, 0.35, 0.3 * vol, 'sawtooth', -1700); this.burst(0.2, 0.4 * vol, 4000, 2); break;
      case 'boom': this.burst(0.7, vol, 220, 0.4, 'lowpass'); this.tone(70, 0.5, 0.8 * vol, 'sine', -45); break;
      case 'hit': this.burst(0.04, 0.2 * vol, 3200, 2); break;
      case 'death': this.tone(200, 0.2, 0.2 * vol, 'triangle', -140); break;
      case 'cash': this.tone(1320, 0.09, 0.22 * vol, 'square'); this.tone(1760, 0.16, 0.22 * vol, 'square', 0, 0.08); break;
      case 'pickup': this.tone(660, 0.07, 0.25 * vol, 'triangle', 300); break;
      case 'levelup': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 0.25, 'triangle', 0, i * 0.08)); break;
      case 'quest': [784, 988, 1175].forEach((f, i) => this.tone(f, 0.16, 0.22, 'square', 0, i * 0.07)); break;
      case 'error': this.tone(160, 0.14, 0.25, 'square', -40); break;
      case 'click': this.tone(900, 0.03, 0.15, 'square'); break;
      case 'build': this.burst(0.15, 0.35 * vol, 600, 1); this.tone(330, 0.12, 0.2 * vol, 'triangle', 110); break;
      case 'siren': for (let i = 0; i < 4; i++) { this.tone(620, 0.28, 0.2, 'sawtooth', 320, i * 0.56); this.tone(940, 0.28, 0.2, 'sawtooth', -320, i * 0.56 + 0.28); } break;
      case 'wail': this.tone(700, 0.55, 0.12, 'sawtooth', 500); this.tone(1200, 0.55, 0.12, 'sawtooth', -500, 0.55); this.tone(700, 0.55, 0.12, 'sawtooth', 500, 1.1); this.tone(1200, 0.55, 0.12, 'sawtooth', -500, 1.65); break;
      case 'announce': this.tone(392, 0.3, 0.25, 'triangle'); this.tone(587, 0.4, 0.25, 'triangle', 0, 0.15); break;
      case 'crash': this.burst(0.2, 0.7 * vol, 800, 0.4); break;
      case 'reload': this.tone(500, 0.03, 0.15, 'square'); this.tone(700, 0.03, 0.15, 'square', 0, 0.12); break;
      case 'dash': this.burst(0.15, 0.25, 1200, 0.5, 'highpass'); break;
      case 'door': this.tone(140, 0.08, 0.3, 'square', -60); break;
      case 'win': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.35, 0.25, 'triangle', 0, i * 0.11)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 0.25, 'sawtooth', 0, i * 0.18)); break;
    }
  }
  /** 차량 엔진음: speed 0..1, 탑승 안 하면 -1 */
  setEngine(speed: number): void {
    const c = this.ctx; if (!c || !this.master) return;
    if (speed < 0) { if (this.engine) { this.engine.gain.gain.setTargetAtTime(0, c.currentTime, 0.05); } return; }
    if (!this.engine) { const osc = c.createOscillator(), gain = c.createGain(); osc.type = 'sawtooth'; gain.gain.value = 0; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; osc.connect(f); f.connect(gain); gain.connect(this.master); osc.start(); this.engine = { osc, gain }; }
    this.engine.osc.frequency.setTargetAtTime(55 + speed * 120, c.currentTime, 0.08); this.engine.gain.gain.setTargetAtTime(this.enabled ? 0.09 : 0, c.currentTime, 0.08);
  }
  intensity = 0;
  private tick(): void { // 잔잔한 베이스 루프: 교전 중이면 템포감 증가
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return; const s = this.step++ % 16, bass = [55, 55, 0, 55, 65.4, 0, 55, 0, 49, 49, 0, 49, 73.4, 0, 65.4, 0][s];
    if (bass) this.tone(bass, 0.19, 0.11, 'triangle');
    if (this.intensity > 0.3 && s % 2 === 0) this.burst(0.03, 0.05, 7000, 1, 'highpass');
    if (this.intensity > 0.6 && s % 4 === 0) this.tone(90, 0.1, 0.16, 'sine', -50);
  }
}
