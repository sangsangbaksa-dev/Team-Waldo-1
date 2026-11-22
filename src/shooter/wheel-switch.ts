// ZERO ZONE: convert mouse wheel and high-resolution trackpad events into
// one weapon swap per continuous gesture (including inertial scroll).
const GESTURE_IDLE_MS = 220;
const PIXEL_THRESHOLD = 10;

export class WheelSwapGate {
  private lastEvent = -Infinity;
  private accumulated = 0;
  private fired = false;

  feed(deltaY: number, now: number, mode = 0): boolean {
    if (!Number.isFinite(deltaY) || !Number.isFinite(now) || !Number.isInteger(mode) || mode < 0 || mode > 2) return false;
    // WheelEvent.DELTA_LINE / DELTA_PAGE use nonpixel units.
    const amount = deltaY * (mode === 1 ? 16 : mode === 2 ? 600 : 1);
    if (now - this.lastEvent > GESTURE_IDLE_MS || now < this.lastEvent) {
      this.accumulated = 0;
      this.fired = false;
    }
    this.lastEvent = now;
    if (this.fired) return false;
    // Opposing tiny gestures should cancel rather than combine.
    this.accumulated += amount;
    if (Math.abs(this.accumulated) < PIXEL_THRESHOLD) return false;
    this.fired = true;
    return true;
  }

  reset(): void {
    this.lastEvent = -Infinity;
    this.accumulated = 0;
    this.fired = false;
  }
}
