/**
 * Wall-clock gate for non-simulation work (e.g. minimaps).
 * First call and the first call after reset run immediately. Long stalls do
 * not trigger a burst of backlogged work; physics/input must stay outside.
 */
export class FrameGate {
  private next = -Infinity;
  private last = -Infinity;
  constructor(private readonly intervalMs: number) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new RangeError('intervalMs must be positive');
  }
  reset(): void { this.next = this.last = -Infinity; }
  due(now: number): boolean {
    if (!Number.isFinite(now)) return false;
    if (now < this.last) this.reset();
    this.last = now;
    if (now < this.next) return false;
    this.next = now + this.intervalMs;
    return true;
  }
}
