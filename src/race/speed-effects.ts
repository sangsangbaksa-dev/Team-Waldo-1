/** Cosmetic speed streaks are independent of physics and WebGL rendering. */
export class RaceSpeedEffects {
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width / 2));
    const h = Math.max(1, Math.floor(height / 2));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  render(intensity: number, reducedMotion: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (reducedMotion || intensity < 0.22) return;

    const cx = w / 2, cy = h * 0.46, radius = Math.hypot(w, h) / 2;
    const strength = Math.min(1, (intensity - 0.22) * 1.2);
    const count = 36 + Math.floor(strength * 50);
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const start = radius * (0.38 + Math.random() * 0.35);
      const end = start + radius * (0.1 + Math.random() * 0.25) * (0.5 + strength);
      ctx.strokeStyle = `rgba(${200 + Math.random() * 55 | 0},${225 + Math.random() * 30 | 0},255,${(0.1 + Math.random() * 0.3) * strength})`;
      ctx.lineWidth = 0.6 + Math.random() * 1.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
      ctx.lineTo(cx + Math.cos(angle) * end, cy + Math.sin(angle) * end);
      ctx.stroke();
    }
  }
}
