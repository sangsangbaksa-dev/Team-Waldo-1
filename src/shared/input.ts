/** Convert DOM wheel units to pixels, rejecting invalid device input. */
export function wheelPixels(delta: number, mode: number, page = 120): number {
  if (!Number.isFinite(delta)) return 0;
  return delta * (mode === 1 ? 16 : mode === 2 ? Math.max(1, page) : 1);
}

/**
 * One weapon step per continuous scroll burst. Small precision-trackpad
 * deltas accumulate; inertial tails cannot trigger extra weapon changes.
 * A deliberate direction reversal or a quiet gap starts a new burst.
 */
export class WheelGesture {
  private last = -Infinity;
  private direction = 0;
  private distance = 0;
  private fired = false;

  reset(): void {
    this.last = -Infinity;
    this.direction = this.distance = 0;
    this.fired = false;
  }

  push(delta: number, now: number, pinch = false): -1 | 0 | 1 {
    if (pinch || !Number.isFinite(delta) || !Number.isFinite(now) || delta === 0) return 0;
    const direction = delta > 0 ? 1 : -1;
    if (now - this.last >= 180 || now < this.last || (direction !== this.direction && Math.abs(delta) >= 16)) {
      this.distance = 0;
      this.fired = false;
      this.direction = direction;
    }
    this.last = now;
    if (direction !== this.direction || this.fired) return 0;
    this.distance += Math.abs(delta);
    if (this.distance < 20) return 0;
    this.fired = true;
    return direction;
  }
}

/** A small neutral zone avoids steering from incidental finger movement. */
export function dragSteer(offset: number, range = 100, deadzone = 5): number {
  if (!Number.isFinite(offset) || !Number.isFinite(range) || !Number.isFinite(deadzone) || range <= deadzone || deadzone < 0) return 0;
  return Math.sign(offset) * Math.min(1, Math.max(0, (Math.abs(offset) - deadzone) / (range - deadzone)));
}

export function editableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
}
