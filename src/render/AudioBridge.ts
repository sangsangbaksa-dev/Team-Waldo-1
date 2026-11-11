import type { SimEvent } from "../sim";
export class AudioBridge {
  private static context: AudioContext | undefined;
  static muted = (() => {
    try {
      return localStorage.getItem("warden.muted") === "true";
    } catch {
      return false;
    }
  })();
  private last = 0;
  private beat = 0;
  static unlock(): void {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch {
      /* optional */
    }
  }
  static toggle(): void {
    this.muted = !this.muted;
    this.unlock();
    try {
      localStorage.setItem("warden.muted", String(this.muted));
    } catch {
      /* optional */
    }
  }
  private tone(
    hz: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
  ): void {
    const c = AudioBridge.context;
    if (!c || AudioBridge.muted || c.state !== "running") return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, c.currentTime);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(volume, c.currentTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + duration);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  ambience(time: number): void {
    if (time < this.beat) return;
    this.beat = time + 2.4;
    const notes = [146.83, 174.61, 220, 196, 146.83, 130.81, 174.61, 110];
    this.tone(notes[Math.floor(time / 2.4) % notes.length], 2.2, 0.022);
    this.tone(73.42, 2.2, 0.012);
  }
  handle(e: SimEvent): void {
    const now = performance.now();
    if (e.t === "levelUp") {
      this.tone(523, 0.6, 0.05);
      this.tone(784, 0.8, 0.035);
      return;
    }
    if (e.t === "playerHurt") {
      this.tone(85, 0.23, 0.065, "triangle");
      return;
    }
    if (e.t === "bossSpawn") {
      this.tone(55, 1.6, 0.07, "triangle");
      return;
    }
    if (e.t === "runEnd") {
      this.tone(e.victory ? 440 : 110, 1.5, 0.06);
      return;
    }
    if (now - this.last < 80) return;
    if (e.t === "fire") {
      this.tone(370, 0.08, 0.012, "triangle");
      this.last = now;
    }
    if (e.t === "pickup") {
      this.tone(880, 0.1, 0.018);
      this.last = now;
    }
  }
}
