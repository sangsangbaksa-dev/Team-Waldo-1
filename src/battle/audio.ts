/** Short original synthesized cues. No network requests or audio files. */
export class BattleAudio {
  private context?: AudioContext;
  private muted = false;
  private lastNotice = 0;
  unlock(): void {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => undefined); } catch { /* Audio is optional. */ }
  }
  setMuted(muted: boolean): void { this.muted = muted; }
  play(kind: 'click' | 'upgrade' | 'capture' | 'warning' | 'victory' | 'defeat'): void {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    if (kind === 'warning' && ctx.currentTime - this.lastNotice < 3) return;
    if (kind === 'warning') this.lastNotice = ctx.currentTime;
    const notes = { click: [440], upgrade: [392, 523, 659], capture: [523, 659, 784], warning: [220, 174], victory: [392, 523, 659, 784], defeat: [330, 262, 196] }[kind];
    notes.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      const start = ctx.currentTime + i * .09;
      oscillator.type = kind === 'warning' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.065, start + .012);
      gain.gain.exponentialRampToValueAtTime(.001, start + .22);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(start); oscillator.stop(start + .24);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
  dispose(): void { if (this.context) void this.context.close().catch(() => undefined); }
}
