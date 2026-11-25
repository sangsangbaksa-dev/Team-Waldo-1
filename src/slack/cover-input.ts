/** The study cover remains held until all active input sources are released. */
export class CoverInput {
  private keyboard = false;
  private primary: number | null = null;
  private middle: number | null = null;

  get active(): boolean { return this.keyboard || this.primary !== null || this.middle !== null; }

  pressKey(): void { this.keyboard = true; }
  releaseKey(): boolean {
    const held = this.keyboard;
    this.keyboard = false;
    return held;
  }
  claimPrimary(id: number): boolean {
    if (this.primary !== null || !Number.isInteger(id) || id < 0) return false;
    this.primary = id;
    return true;
  }
  releasePrimary(id: number): boolean {
    if (this.primary !== id) return false;
    this.primary = null;
    return true;
  }
  claimMiddle(id: number): boolean {
    if (this.middle !== null || !Number.isInteger(id) || id < 0) return false;
    this.middle = id;
    return true;
  }
  releaseMiddle(id: number): boolean {
    if (this.middle !== id) return false;
    this.middle = null;
    return true;
  }
  clear(): number | null {
    const pointer = this.primary;
    this.keyboard = false;
    this.primary = this.middle = null;
    return pointer;
  }
}
