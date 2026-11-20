/**
 * Wall-clock gate for non-simulation work (e.g. minimaps).
 * First call and the first call after reset run immediately. Long stalls do
 * not trigger a burst of backlogged work; physics/input must stay outside.
 */
export class FrameGate {
  private next = -Infinity;
  constructor(private readonly intervalMs: number) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new RangeError('intervalMs must be positive');
  }
  reset(): void { this.next = -Infinity; }
  due(now: number): boolean {
    if (!Number.isFinite(now) || now < this.next) return false;
    this.next = now + this.intervalMs;
    return true;
  }
}
