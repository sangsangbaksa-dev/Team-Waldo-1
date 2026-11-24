/** Keeps a short weapon press alive long enough for the next simulation frame. */
export class TapBuffer {
  private remaining = 0;

  press(seconds = 0.14): void { this.remaining = Math.max(this.remaining, seconds); }
  get active(): boolean { return this.remaining > 0; }
  tick(dt: number): void { this.remaining = Math.max(0, this.remaining - Math.max(0, dt)); }
  reset(): void { this.remaining = 0; }
}
