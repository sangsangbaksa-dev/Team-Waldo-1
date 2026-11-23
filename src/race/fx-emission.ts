// SPEED RUSH — fixed-rate emission independent of display refresh.
// Every visual channel owns fractional emission credit; spare credit is dropped
// when the burst cap is reached, so a suspended tab cannot cause an FX storm.
export class FxEmissionBudget {
  private carry: Float32Array;
  constructor(slots: number) {
    if (!Number.isInteger(slots) || slots <= 0) throw new RangeError('slots must be positive');
    this.carry = new Float32Array(slots);
  }
  take(slot: number, particlesPerSecond: number, dt: number, maxBurst = 12): number {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.carry.length) return 0;
    if (!Number.isFinite(particlesPerSecond) || particlesPerSecond <= 0) { this.carry[slot] = 0; return 0; }
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    const budget = this.carry[slot] + particlesPerSecond * Math.min(0.1, dt);
    const whole = Math.floor(budget + 1e-8);
    this.carry[slot] = Math.max(0, budget - whole);
    return Math.min(whole, Math.max(0, Math.floor(maxBurst)));
  }
}
